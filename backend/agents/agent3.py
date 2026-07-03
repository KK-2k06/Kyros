import os
import json
from youtube_transcript_api import YouTubeTranscriptApi, IpBlocked, RequestBlocked
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from youtubesearchpython import Video

# Load env variables (in case they weren't loaded yet)
from dotenv import load_dotenv
load_dotenv()

# Initialize Embeddings and LLM
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2", google_api_key=GEMINI_KEY)
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0.2, google_api_key=GEMINI_KEY)

# ChromaDB persistent directory
CHROMA_DIR = "./chroma_db"

def init_video_rag(video_id: str):
    """
    Fetches the transcript for the given video_id, chunks it, and stores it in ChromaDB.
    Also fetches video metadata.
    """
    # Fetch Video Metadata
    metadata = None
    try:
        vid_info = Video.getInfo(f"https://www.youtube.com/watch?v={video_id}")
        if vid_info:
            dur = vid_info.get("duration")
            dur_formatted = "--:--"
            if isinstance(dur, dict):
                try:
                    seconds = int(dur.get("secondsText", "0"))
                    h = seconds // 3600
                    m = (seconds % 3600) // 60
                    s = seconds % 60
                    if h > 0:
                        dur_formatted = f"{h}:{m:02d}:{s:02d}"
                    else:
                        dur_formatted = f"{m}:{s:02d}"
                except Exception:
                    dur_formatted = str(dur.get("simpleText", "--:--"))
            else:
                dur_formatted = str(dur)

            views_dict = vid_info.get("viewCount", {})
            views_str = "---"
            if isinstance(views_dict, dict):
                views_str = views_dict.get("text", views_dict.get("short", "---"))
            else:
                views_str = str(views_dict)

            pub_date = vid_info.get("publishDate", "")
            pub_formatted = "---"
            if pub_date:
                try:
                    date_part = pub_date.split("T")[0]
                    y, m, d = date_part.split("-")
                    pub_formatted = f"{d}/{m}/{y}"
                except Exception as e:
                    print(f"Date parse error: {e}. Raw date: {pub_date}")
                    pub_formatted = str(pub_date)

            metadata = {
                "title": vid_info.get("title"),
                "channel": vid_info.get("channel", {}).get("name"),
                "views": views_str,
                "duration": dur_formatted,
                "published": pub_formatted,
                "description": vid_info.get("description", "")
            }
    except Exception as e:
        print(f"Error fetching metadata for {video_id}: {e}")

    # Fetch Transcript
    full_text = ""
    raw_transcript = []
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        transcript = None
        try:
            transcript = transcript_list.find_transcript(['en', 'en-US', 'en-GB', 'en-IN'])
        except Exception:
            try:
                transcript = transcript_list.find_generated_transcript(['en', 'en-US', 'en-GB', 'en-IN'])
            except (IpBlocked, RequestBlocked) as e:
                print(f"  ⚠️  {video_id}: YouTube is RATE LIMITING you. Bypassing check for development.")
                raw_transcript = [
                    {"text": f"This is a placeholder transcript due to rate limiting. The topic is: {metadata.get('title', 'Unknown')}.", "start": 0.0, "duration": 5.0}
                ]
                full_text = " ".join([t['text'] for t in raw_transcript])
                return {"msg": "I've loaded a placeholder context due to rate limiting.", "metadata": metadata, "transcript": raw_transcript}
            except Exception:
                for t in transcript_list:
                    transcript = t
                    break
                    
        if not transcript:
            raise Exception("No transcript found")
            
        fetched_snippets = transcript.fetch()
        raw_transcript = [{"text": t.text, "start": t.start, "duration": getattr(t, 'duration', 0)} for t in fetched_snippets]
        full_text = " ".join([t['text'] for t in raw_transcript])
    except Exception as e:
        print(f"  ⚠️ Error/Rate-Limit fetching transcript for {video_id}: {e}")
        print("  ⚠️ Using fallback dummy transcript for development.")
        raw_transcript = [
            {"text": f"This is a placeholder transcript. The real transcript could not be loaded because YouTube is currently rate-limiting your IP address.", "start": 0.0, "duration": 5.0},
            {"text": f"However, you can still test the chat interface. The topic of this video is: {metadata.get('title', 'Unknown')}.", "start": 5.0, "duration": 5.0}
        ]
        full_text = " ".join([t['text'] for t in raw_transcript])

    vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    
    # Check if already indexed
    existing_docs = vectorstore.similarity_search("hello", k=1, filter={"video_id": video_id})
    if existing_docs:
        return {
            "msg": "I've loaded the transcript context. What would you like to know about this video?",
            "metadata": metadata,
            "transcript": raw_transcript,
            "raw_video_info": vid_info if 'vid_info' in locals() else None
        }

    # Chunk Transcript
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    chunks = text_splitter.split_text(full_text)
    
    # Prepare metadata
    metadatas = [{"video_id": video_id} for _ in chunks]

    # Store in ChromaDB
    vectorstore.add_texts(texts=chunks, metadatas=metadatas)
    
    return {
        "msg": "I've analyzed the video transcript and prepared the context! What would you like to dive into?",
        "metadata": metadata,
        "transcript": raw_transcript,
        "raw_video_info": vid_info if 'vid_info' in locals() else None
    }

def chat_with_video(video_id: str, message: str, chat_history: str):
    """
    Retrieves relevant chunks from ChromaDB for the given video_id and answers the user's message.
    """
    vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    
    # 1. Retrieve top chunks for this specific video
    # Note: the filter syntax in Chroma is a simple dictionary
    docs = vectorstore.similarity_search(message, k=5, filter={"video_id": video_id})
    context = "\n\n".join([doc.page_content for doc in docs])
    
    # 2. Build Prompt
    prompt_template = """
You are Kyros, an expert AI tutor helping a user deeply understand a YouTube video they are currently watching.

Use the following transcript excerpts from the video to answer the user's question accurately.
If the answer is not in the transcript excerpts, just say that the video doesn't seem to explicitly cover it, and then offer your own general knowledge to help them understand the concept anyway.

Here is the conversation history:
{chat_history}

Here are the relevant transcript excerpts from the video:
{context}

User's Question: {message}

Answer clearly, using markdown formatting, bullet points, or bold text where appropriate for readability.
"""
    
    prompt = PromptTemplate(
        input_variables=["chat_history", "context", "message"],
        template=prompt_template
    )
    
    formatted_prompt = prompt.format(
        chat_history=chat_history,
        context=context,
        message=message
    )
    
    # 3. Generate Answer
    response = llm.invoke(formatted_prompt)
    return response.content
