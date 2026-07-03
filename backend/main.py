
# ============================================================
# Kyros AI — FastAPI Backend
# Run with: uvicorn main:app --reload --port 8000
# ============================================================

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import tempfile
import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

from agents.agent1 import analyse_gaps, build_rag_chain, chat_with_agent1
from agents.agent2 import fetch_videos_for_gaps, chat_with_agent2
from agents.agent3 import init_video_rag, chat_with_video
from agents.agent4 import generate_test_questions, evaluate_test, get_jd_text_from_chroma

# ── Supabase client setup ───────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── FastAPI app setup ────────────────────────────────────────
app = FastAPI(title="Kyros AI API")

# Allow React frontend (running on localhost:5173 by default with Vite) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],   # Vite dev server default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth dependency ──────────────────────────────────────────
# This function runs before any protected route.
# It checks the Authorization header for a valid Supabase token
# and extracts the user's UUID — used for ChromaDB collection naming.
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Extracts and verifies the Supabase JWT token from the Authorization header.
    Returns the user's UUID if valid, raises 401 if not.
    """
    token = credentials.credentials
    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
        return user_id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── In-memory store for active RAG chains per session ────────
# Key: session_id, Value: the ConversationalRetrievalChain object
# This avoids rebuilding the chain on every chat message
active_chains = {}


# ── ROUTES ───────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Kyros AI API is running"}


@app.post("/api/agent1/analyse")
async def agent1_analyse(
    session_id: str = Form(...),
    resume: UploadFile = File(...),
    jd: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Agent 1 — Gap Analysis endpoint.
    Takes resume + JD PDFs, returns structured gap analysis.
    Also builds the RAG chain and stores it for this user (for chat later).
    """
    
    # Save uploaded files temporarily so PyPDFLoader can read them
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_resume:
        tmp_resume.write(await resume.read())
        resume_path = tmp_resume.name
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_jd:
        tmp_jd.write(await jd.read())
        jd_path = tmp_jd.name
    
    # Step 1: Run gap analysis
    gap_data = analyse_gaps(resume_path, jd_path)
    
    # Step 2: Build the RAG chain for this session
    chain = build_rag_chain(resume_path, jd_path, session_id)
    active_chains[session_id] = chain   # store for chat endpoint to reuse
    
    # Clean up temp files
    os.remove(resume_path)
    os.remove(jd_path)
    
    return {
        "gap_analysis": gap_data,
        "message": "Analysis complete. You can now chat about your results."
    }


@app.post("/api/agent1/chat")
async def agent1_chat(
    session_id: str = Form(...),
    message: str = Form(...),
    chat_history: str = Form("[]"),
    user_id: str = Depends(get_current_user)
):
    """
    Agent 1 — Conversational chat endpoint.
    Uses the previously built RAG chain (or rebuilds from ChromaDB if server restarted).
    """
    
    # If chain not in memory (e.g. server restarted), rebuild it from existing ChromaDB collection
    if session_id not in active_chains:
        past_history = json.loads(chat_history)
        chain = build_rag_chain(None, None, session_id, load_existing=True, past_history=past_history)
        active_chains[session_id] = chain
    
    chain = active_chains[session_id]
    response = chat_with_agent1(chain, message)
    
    return response

from langchain_google_genai import ChatGoogleGenerativeAI

@app.post("/api/agent1/title")
async def agent1_title(
    message: str = Form(...),
    user_id: str = Depends(get_current_user)
):
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.7
    )
    prompt = f"Generate a short, 3-4 word title for this conversation based on the user's first message/request. Do not use quotes or markdown. Just the words.\n\nMessage: {message}\n\nTitle:"
    response = llm.invoke(prompt)
    title = response.content.strip().replace('"', '')
    return {"title": title}


@app.post("/api/agent2/fetch-videos")
async def agent2_fetch_videos(
    session_id: str = Form(...),
    user_id: str = Depends(get_current_user)
):
    try:
        data = fetch_videos_for_gaps(session_id)
        return data
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent2/chat")
async def agent2_chat_endpoint(
    message: str = Form(...),
    chat_history: str = Form("[]"),
    user_id: str = Depends(get_current_user)
):
    try:
        history = json.loads(chat_history)
        response = chat_with_agent2(message, history)
        return response
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# AGENT 3 - DEEP DIVE (VIDEO RAG)
# ==============================================================================
@app.post("/api/agent3/init")
async def init_agent3(
    session_id: str = Form(...),
    video_id: str = Form(...)
):
    try:
        data = init_video_rag(video_id)
        return data
    except Exception as e:
        print("Agent 3 Init Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent3/chat")
async def chat_agent3(
    video_id: str = Form(...),
    message: str = Form(...),
    chat_history: str = Form(...)
):
    try:
        response = chat_with_video(video_id, message, chat_history)
        return {"response": response}
    except Exception as e:
        print("Agent 3 Chat Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# AGENT 4 - MOCK INTERVIEW / TEST
# ==============================================================================
@app.post("/api/agent4/generate")
async def agent4_generate(
    session_id: str = Form(...),
    user_id: str = Depends(get_current_user)
):
    try:
        questions = generate_test_questions(session_id)
        return {"questions": questions}
    except Exception as e:
        print("Agent 4 Generate Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agent4/evaluate")
async def agent4_evaluate(
    session_id: str = Form(...),
    questions: str = Form(...),
    answers: str = Form(...),
    user_id: str = Depends(get_current_user)
):
    try:
        questions_dict = json.loads(questions)
        answers_dict = json.loads(answers)
        jd_text = get_jd_text_from_chroma(session_id)
        
        evaluation = evaluate_test(jd_text, questions_dict, answers_dict)
        return {"evaluation": evaluation}
    except Exception as e:
        print("Agent 4 Evaluate Error:", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
