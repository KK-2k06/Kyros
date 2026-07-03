# Kyros AI — Career Coach & Interview Prep Platform

Kyros AI is an intelligent career coaching assistant powered by Google Gemini, LangChain, and ChromaDB. It helps candidates bridge the gap between their current resume and their dream job through a 4-agent ecosystem.

## Features (The 4 Agents)

1. **Agent 1: Gap Analysis & RAG Chat**
   * Upload your Resume and a target Job Description (JD).
   * Generates a structured gap analysis highlighting missing skills.
   * Conversational RAG: Chat directly with your resume/JD to ask for tailored advice.

2. **Agent 2: Learning Resource Fetcher**
   * Automatically fetches top YouTube tutorials to help you close the skill gaps identified in Step 1.
   * Chat interface to ask questions about the recommended learning paths.

3. **Agent 3: Deep Dive Video RAG**
   * Embeds YouTube video transcripts directly into ChromaDB.
   * Chat directly with the video: Ask questions and get answers grounded *only* in what the video actually taught.

4. **Agent 4: Mock Interview & Evaluator**
   * Automatically generates tailored interview questions based on your Resume and the JD.
   * Evaluates your answers against the core requirements and provides feedback.

## Tech Stack

* **Backend:** FastAPI (Python), LangChain, ChromaDB (Persistent local vector storage)
* **LLM:** Google Gemini (2.5 Flash Lite / Text Embedding 2)
* **Frontend:** React + Vite
* **Authentication:** Supabase

## Getting Started

### Prerequisites
* Python 3.9+
* Node.js v18+
* A Google Gemini API Key
* A Supabase Project (URL and Anon Key)

### 1. Backend Setup
```bash
cd backend
python -m venv env
# On Windows: env\Scripts\activate
# On Mac/Linux: source env/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend` folder:
```
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
```

Run the FastAPI server:
```bash
py main.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` folder:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the Vite dev server:
```bash
npm run dev
```

## Evaluation
The backend contains a script `evaluate_rag.py` to evaluate the RAG pipeline metrics (Context Precision, Recall, Faithfulness, and Answer Relevance) using the **Ragas** framework.
