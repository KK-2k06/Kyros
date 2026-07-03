
# ============================================================
# AGENT 1 — Gap Analyser + Conversational RAG Chat
# Using ChromaDB instead of FAISS for PERSISTENT storage
# ============================================================
# Key difference from FAISS version:
#   - ChromaDB saves to disk (persist_directory) — survives server restarts
#   - Each user gets their own "collection" named by their user_id
#   - This means a user can close the browser, come back tomorrow,
#     login again, and continue the SAME conversation with the SAME data
# ============================================================

import os
import json
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma          # ← changed from FAISS
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate

load_dotenv()

# Disable ChromaDB telemetry to fix "capture() takes 1 positional argument" error
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# All ChromaDB data gets saved here on disk
CHROMA_PERSIST_DIR = "./chroma_db"


def load_pdf_text(pdf_path: str) -> str:
    """Loads a PDF and returns all text as one string."""
    loader = PyPDFLoader(pdf_path)
    pages = loader.load()
    return "\n\n".join([page.page_content for page in pages])


def analyse_gaps(resume_path: str, jd_path: str) -> dict:
    """
    Core gap analysis — same as before, no ChromaDB needed here
    since this is a one-shot LLM call, not a retrieval task.
    """
    
    print("Reading resume...")
    resume_text = load_pdf_text(resume_path)
    
    print("Reading job description...")
    jd_text = load_pdf_text(jd_path)
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0
    )
    
    gap_prompt = f"""
You are a professional career coach and talent analyst.

Analyse the following resume against the job description and provide a detailed gap analysis.

RESUME:
{resume_text}

JOB DESCRIPTION:
{jd_text}

Provide your analysis in the following JSON format ONLY. No extra text outside the JSON:
{{
    "candidate_name": "extracted from resume",
    "role_applied": "extracted from JD",
    "strengths": ["skill or experience the candidate has that matches the JD"],
    "weaknesses": ["skills mentioned in JD that candidate has but at a lower level"],
    "gaps": [
        {{"skill": "skill name", "importance": "high/medium/low", "reason": "why this skill matters"}}
    ],
    "match_percentage": "estimated percentage as a number",
    "summary": "2-3 sentence overall assessment",
    "top_priority_to_learn": "the single most important skill to learn first"
}}
"""
    
    print("Analysing gaps with Gemini...")
    response = llm.invoke(gap_prompt)
    
    raw_text = response.content.strip()
    raw_text = raw_text.replace("```json", "").replace("```", "").strip()
    
    try:
        gap_analysis = json.loads(raw_text)
    except json.JSONDecodeError:
        gap_analysis = {"raw_analysis": raw_text, "error": "Could not parse structured output"}
    
    return gap_analysis


def build_rag_chain(resume_path: str, jd_path: str, session_id: str, load_existing: bool = False, past_history: list = None):
    """
    Builds (or loads) a conversational RAG chain over resume + JD using ChromaDB.
    
    KEY CHANGE FROM FAISS VERSION:
    - collection_name=session_id means each chat session has their own isolated vector space
    - persist_directory means data is saved to disk, not just RAM
    - load_existing=True means we're reconnecting to a PREVIOUSLY saved collection
      (e.g. user logged in again tomorrow — no need to re-upload PDFs)
    """
    
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-2",
        google_api_key=os.getenv("GEMINI_API_KEY")
    )
    
    if load_existing:
        # Reconnect to an existing ChromaDB collection for this session
        # No new documents to add — just load what's already on disk
        print(f"Loading existing ChromaDB collection for session {session_id}...")
        vector_store = Chroma(
            collection_name=f"resume_jd_{session_id}",
            embedding_function=embeddings,
            persist_directory=CHROMA_PERSIST_DIR
        )
    else:
        # Fresh upload — build a new collection from scratch
        resume_loader = PyPDFLoader(resume_path)
        jd_loader = PyPDFLoader(jd_path)
        
        resume_docs = resume_loader.load()
        jd_docs = jd_loader.load()
        
        for doc in resume_docs:
            doc.metadata["source"] = "Resume"
        for doc in jd_docs:
            doc.metadata["source"] = "Job Description"
        
        all_docs = resume_docs + jd_docs
        
        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = splitter.split_documents(all_docs)
        print(f"Created {len(chunks)} chunks from resume + JD")
        
        print(f"Building ChromaDB collection for session {session_id}...")
        vector_store = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            collection_name=f"resume_jd_{session_id}",   # ← isolated per session
            persist_directory=CHROMA_PERSIST_DIR        # ← saved to disk permanently
        )
        # Note: Chroma auto-persists when persist_directory is set — no manual .persist() needed
    
    retriever = vector_store.as_retriever(search_kwargs={"k": 4})
    
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key="answer"
    )
    
    if past_history:
        for msg in past_history:
            if msg.get("role") == "user":
                memory.chat_memory.add_user_message(msg.get("content", ""))
            elif msg.get("role") == "assistant":
                memory.chat_memory.add_ai_message(msg.get("content", ""))
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.3
    )
    
    qa_prompt = PromptTemplate(
        input_variables=["context", "chat_history", "question"],
        template="""
You are Kyros AI — a helpful, encouraging career advisor.
You have access to the candidate's resume and the job description.

Use the context below to answer the candidate's question.
If the candidate says they already know a skill, acknowledge it and update your advice.
If asked what to learn, prioritise based on the job requirements.
Always be specific, actionable, and encouraging.

Context from documents:
{context}

Conversation history:
{chat_history}

Candidate's question: {question}

Your response as Kyros AI:
"""
    )
    
    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        combine_docs_chain_kwargs={"prompt": qa_prompt},
        return_source_documents=True,
        output_key="answer"
    )
    
    print(f"RAG chain ready for session {session_id}")
    return chain


def chat_with_agent1(chain, user_message: str) -> dict:
    """Send a message to Agent 1 and get a response with source attribution."""
    result = chain.invoke({"question": user_message})
    
    sources = list(set([
        doc.metadata.get("source", "Unknown")
        for doc in result.get("source_documents", [])
    ]))
    
    return {
        "answer": result["answer"],
        "sources_used": sources
    }
