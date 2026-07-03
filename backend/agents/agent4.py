import os
import json
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma

load_dotenv()

CHROMA_PERSIST_DIR = "./chroma_db"

def get_jd_text_from_chroma(session_id: str) -> str:
    """
    Connects to the session's ChromaDB collection and extracts all chunks
    that belong to the Job Description to reconstruct the full JD text.
    """
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-2",
        google_api_key=os.getenv("GEMINI_API_KEY")
    )
    
    vector_store = Chroma(
        collection_name=f"resume_jd_{session_id}",
        embedding_function=embeddings,
        persist_directory=CHROMA_PERSIST_DIR
    )
    
    # Retrieve only the Job Description chunks
    try:
        results = vector_store.get(include=["documents", "metadatas"])
        if results and "documents" in results and "metadatas" in results:
            docs = [
                doc for doc, meta in zip(results["documents"], results["metadatas"])
                if "job description" in meta.get("source", "").lower()
            ]
            if docs:
                return "\n".join(docs)
    except Exception as e:
        print(f"Error fetching JD from Chroma: {e}")
        
    return "Generic Software Engineering Job Description"


def generate_test_questions(session_id: str) -> dict:
    """
    Generates 10 test questions (7 descriptive, 2 DSA, 1 SQL) 
    based entirely on the Job Description text.
    """
    jd_text = get_jd_text_from_chroma(session_id)
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.2
    )
    
    prompt = f"""
You are an expert technical interviewer. I will provide you with a Job Description. 
Your task is to generate a comprehensive, proctored mock test specifically tailored to the skills, frameworks, and requirements mentioned in this Job Description.

JOB DESCRIPTION:
{jd_text}

REQUIREMENTS:
Generate exactly 10 questions total:
1. 7 Descriptive Questions: These should test deep conceptual knowledge, architectural understanding, or scenario-based problem solving relevant to the JD.
2. 2 DSA Coding Questions: Data Structures and Algorithms problems (Leetcode style). Provide the problem statement, constraints, and expected input/output format.
3. 1 SQL Coding Question: A complex database query problem (e.g., joins, window functions) relevant to the data requirements in the JD. Provide a mock schema and the expected output.

OUTPUT FORMAT:
You MUST return the output as a valid JSON object matching the exact structure below. Do not include markdown code block wrappers (like ```json), just the raw JSON object.

{{
  "descriptive": [
    {{"id": 1, "type": "descriptive", "question": "..."}},
    {{"id": 2, "type": "descriptive", "question": "..."}},
    ... (up to 7)
  ],
  "coding": [
    {{"id": 8, "type": "dsa", "question": "...", "example": "Input: ... Output: ..."}},
    {{"id": 9, "type": "dsa", "question": "...", "example": "Input: ... Output: ..."}},
    {{"id": 10, "type": "sql", "question": "...", "schema": "Table A: ..., Table B: ..."}}
  ]
}}
"""
    
    response = llm.invoke(prompt)
    raw_text = response.content.strip()
    
    # Strip markdown if Gemini includes it
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()
    
    try:
        data = json.loads(raw_text)
        return data
    except Exception as e:
        print("JSON parse error in generate_test_questions:", e)
        print("Raw output:", raw_text)
        # Fallback to a basic template so the app doesn't crash
        return {
            "descriptive": [
                {"id": 1, "type": "descriptive", "question": "Explain the difference between process and thread."},
                {"id": 2, "type": "descriptive", "question": "How does garbage collection work in modern languages?"},
                {"id": 3, "type": "descriptive", "question": "Explain REST vs GraphQL."},
                {"id": 4, "type": "descriptive", "question": "What are SOLID principles?"},
                {"id": 5, "type": "descriptive", "question": "How do you design a scalable web architecture?"},
                {"id": 6, "type": "descriptive", "question": "Explain ACID properties in databases."},
                {"id": 7, "type": "descriptive", "question": "How do you handle security vulnerabilities like XSS and CSRF?"}
            ],
            "coding": [
                {"id": 8, "type": "dsa", "question": "Two Sum: Find two numbers that add up to a target.", "example": "Input: [2,7,11,15], 9. Output: [0,1]"},
                {"id": 9, "type": "dsa", "question": "Reverse a Linked List.", "example": "Input: 1->2->3. Output: 3->2->1"},
                {"id": 10, "type": "sql", "question": "Find the second highest salary from the Employee table.", "schema": "Employee (id, salary)"}
            ]
        }


def evaluate_test(jd_text: str, questions: dict, answers: dict) -> dict:
    """
    Evaluates the user's answers against the JD and the generated questions.
    `answers` format expected: {"1": "user answer", "2": "user answer", ...}
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash-lite",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.1
    )
    
    prompt = f"""
You are an expert technical interviewer evaluating a candidate's test submission for the following Job Description.

JOB DESCRIPTION:
{jd_text}

TEST QUESTIONS:
{json.dumps(questions, indent=2)}

CANDIDATE ANSWERS:
{json.dumps(answers, indent=2)}

INSTRUCTIONS:
1. Grade each answer out of 10.
2. For descriptive questions, look for technical depth, clarity, and correctness.
3. For coding questions (DSA and SQL), perform a dry run. Check for logical correctness, time/space complexity (for DSA), and correct syntax (for SQL). Note that the candidate wrote this in a plain text area without a compiler.
4. Provide constructive feedback for every question.
5. Provide a total score out of 100.

OUTPUT FORMAT:
You MUST return the output as a valid JSON object exactly matching this structure. No markdown wrappers.

{{
  "total_score": 85,
  "summary": "Overall assessment of their performance...",
  "evaluations": [
    {{
      "id": 1,
      "score": 8,
      "feedback": "Good explanation, but missed mentioning X."
    }},
    ... (all 10 questions)
  ]
}}
"""
    response = llm.invoke(prompt)
    raw_text = response.content.strip()
    
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()
    
    try:
        return json.loads(raw_text)
    except Exception as e:
        print("JSON parse error in evaluate_test:", e)
        return {"total_score": 0, "summary": "Evaluation failed due to server error.", "evaluations": []}
