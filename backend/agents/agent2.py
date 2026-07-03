import os
import json
import time
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from youtubesearchpython import VideosSearch
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    IpBlocked,
    RequestBlocked
)
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def has_transcript(video_id: str) -> bool:
    """
    Checks whether a YouTube video has ANY usable transcript
    (manually created OR auto-generated, in ANY language).
    """
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)

        available_transcripts = list(transcript_list)

        if len(available_transcripts) == 0:
            print(f"  ✗ {video_id}: transcript list is empty")
            return False

        print(f"  ✓ {video_id}: found {len(available_transcripts)} transcript(s)")
        return True

    except TranscriptsDisabled:
        print(f"  ✗ {video_id}: transcripts disabled by uploader")
        return False

    except NoTranscriptFound:
        print(f"  ✗ {video_id}: no transcript found in any language")
        return False

    except VideoUnavailable:
        print(f"  ✗ {video_id}: video unavailable (private/deleted)")
        return False

    except (IpBlocked, RequestBlocked) as e:
        print(f"  ⚠️  {video_id}: YouTube is RATE LIMITING you. Bypassing check for development.")
        return True # Assume it has a transcript to keep the app working

    except Exception as e:
        print(f"  ✗ {video_id}: unexpected error — {type(e).__name__}: {e}")
        return False


def fetch_videos_for_gaps(session_id: str):
    """
    1. Fetches the first assistant message from Supabase (Gap Analysis).
    2. Uses Gemini to generate 3 targeted YouTube search queries.
    3. Fetches 2 YouTube videos per query that have a usable transcript.
    """
    response = supabase.table('messages').select('content').eq('session_id', session_id).eq('role', 'assistant').order('created_at', desc=False).limit(1).execute()

    gap_analysis_text = ""
    if response.data and len(response.data) > 0:
        gap_analysis_text = response.data[0]['content']
    else:
        gap_analysis_text = "The user wants to improve their skills based on their resume and JD gaps."

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.3
    )

    prompt = PromptTemplate(
        input_variables=["gap_analysis"],
        template="""
        You are an expert career coach. Based on the following gap analysis between a user's resume and a job description, identify the 3 most critical technical or professional skills the user lacks.
        For each skill, write a highly effective YouTube search query that would yield the best tutorial or learning material. Append terms like "official tutorial", "high quality course", or specific renowned channels like "FreeCodeCamp", "Programming with Mosh" to ensure high-quality verified results.

        Gap Analysis:
        {gap_analysis}

        Output your response as a raw JSON array of exactly 3 strings (e.g. ["react hooks tutorial FreeCodeCamp", "advanced docker official tutorial", "system design basics full course"]). Do not include any markdown formatting, backticks, or other text. Just the JSON array.
        """
    )

    chain = prompt | llm
    result = chain.invoke({"gap_analysis": gap_analysis_text})

    try:
        raw_content = result.content.strip()
        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]
        raw_content = raw_content.strip()
        queries = json.loads(raw_content)
    except Exception as e:
        print("JSON parse error:", e, result.content)
        queries = ["technical interview preparation", "resume building tips", "software engineering best practices"]

    videos = _search_youtube_videos(queries[:3])
    return {"videos": videos, "queries": queries}

def _search_youtube_videos(queries: list) -> list:
    videos = []
    seen_ids = set()

    for query in queries[:3]:
        try:
            print(f"\n🔍 Searching: {query}")
            vs = VideosSearch(query, limit=10)
            results = vs.result().get('result', [])
            valid_videos_for_query = 0

            for res in results:
                if valid_videos_for_query >= 1:
                    break

                vid_id = res.get('id')
                if vid_id in seen_ids:
                    continue

                time.sleep(0.5)

                if not has_transcript(vid_id):
                    continue

                seen_ids.add(vid_id)

                thumbnails = res.get('thumbnails', [])
                thumb_url = thumbnails[0].get('url') if thumbnails else None
                if thumbnails:
                    sorted_thumbs = sorted(thumbnails, key=lambda x: x.get('width', 0), reverse=True)
                    thumb_url = sorted_thumbs[0].get('url')

                videos.append({
                    "id": vid_id,
                    "title": res.get('title'),
                    "duration": res.get('duration'),
                    "views": res.get('viewCount', {}).get('short'),
                    "channel": res.get('channel', {}).get('name'),
                    "thumbnail": thumb_url,
                    "link": res.get('link'),
                    "query": query
                })
                valid_videos_for_query += 1

            print(f"  → Got {valid_videos_for_query} valid video(s) for this query")

        except Exception as e:
            print(f"Error searching youtube for {query}:", e)

    return videos


def chat_with_agent2(message: str, chat_history: list):
    """
    Agent 2 chat logic.
    A simple conversational LLM aware of its role as a video curator.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.7
    )

    history_context = ""
    for msg in chat_history[-6:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_context += f"{role.capitalize()}: {content}\n"

    prompt = f"""
    You are Agent 2 (Video Learning Assistant) in a Career Coaching platform.
    Your main job is to help the user find and understand video tutorials that bridge the gap between their resume and target job.
    You just fetched relevant YouTube videos for them. If they ask for more videos, you can suggest search terms they should look up, or discuss the topics.
    
    If the user explicitly asks you to find or search for more videos on a topic, you MUST output a JSON response like this:
    ```json
    {{"action": "fetch_videos", "queries": ["new topic 1", "new topic 2"], "response": "Here are the videos you requested!"}}
    ```
    If they are just chatting normally, output normal text.

    Chat History:
    {history_context}

    User: {message}
    Agent 2:
    """

    response = llm.invoke(prompt)
    content = response.content.strip()
    
    try:
        raw = content
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.endswith("```"):
            raw = raw[:-3]
        data = json.loads(raw.strip())
        
        if data.get("action") == "fetch_videos":
            new_videos = _search_youtube_videos(data.get("queries", [])[:3])
            return {"response": data.get("response", "Here are the new videos!"), "new_videos": new_videos}
    except Exception:
        pass
        
    return {"response": content}
