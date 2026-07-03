import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const Agent4 = () => {
  const [testState, setTestState] = useState('pre-test'); // pre-test, loading, testing, evaluating, results
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [evaluation, setEvaluation] = useState(null);
  
  const testContainerRef = useRef(null);



  const startTest = async () => {
    setTestState('loading');
    
    // Check if session exists
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    if (!sid) {
      alert("No active session. Please start with Gap Analysis first.");
      setTestState('pre-test');
      return;
    }

    // Fetch Questions
    try {
      const formData = new FormData();
      formData.append('session_id', sid);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch('http://localhost:8000/api/agent4/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) throw new Error("Failed to generate test");
      const data = await res.json();
      setQuestions(data.questions);

      setTestState('testing');

    } catch (err) {
      console.error(err);
      alert("Failed to load test. Please make sure the backend is running.");
      setTestState('pre-test');
    }
  };

  const submitTest = async () => {
    setTestState('evaluating');

    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    try {
      const formData = new FormData();
      formData.append('session_id', sid);
      formData.append('questions', JSON.stringify(questions));
      formData.append('answers', JSON.stringify(answers));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch('http://localhost:8000/api/agent4/evaluate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) throw new Error("Failed to evaluate test");
      const data = await res.json();
      setEvaluation(data.evaluation);
      setTestState('results');

    } catch (err) {
      console.error(err);
      alert("Evaluation failed.");
      setTestState('pre-test');
    }
  };

  const downloadReport = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;
    try {
      // Adding some padding before capture for better pdf appearance
      element.style.padding = '20px';
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('Practice_Test_Report.pdf');
    } catch (err) {
      console.error("Failed to generate PDF", err);
      alert("Failed to generate PDF report.");
    } finally {
      element.style.padding = '';
    }
  };



  if (testState === 'pre-test') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-white">
        <div className="max-w-2xl w-full text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Mock Interview & Practice Test</h1>
          <p className="text-gray-600 mb-8 text-lg">
            This practice test is strictly tailored to the Job Description you uploaded earlier. 
            It contains 10 questions designed to test your deep conceptual knowledge and coding abilities.
          </p>
          
          <div className="bg-gray-50 rounded-2xl p-6 text-left mb-8 border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-lg mb-4">Rules & Format:</h3>
            <ul className="space-y-3 text-gray-600 list-disc pl-5">
              <li><strong>7 Descriptive Questions:</strong> Conceptual and scenario-based.</li>
              <li><strong>2 DSA Questions:</strong> Leetcode-style algorithmic problems.</li>
              <li><strong>1 SQL Question:</strong> Database querying.</li>
              <li><strong>Practice Mode:</strong> Take your time and focus on providing the best possible answers.</li>
            </ul>
          </div>

          <button 
            onClick={startTest}
            className="bg-black hover:bg-gray-800 text-white font-semibold py-4 px-12 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 text-lg"
          >
            Start Practice Test
          </button>
        </div>
      </div>
    );
  }

  if (testState === 'loading') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
        <p className="text-gray-600 font-medium">Generating your custom test from the Job Description...</p>
      </div>
    );
  }

  if (testState === 'evaluating') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
        <p className="text-gray-600 font-medium">Evaluating your answers and generating feedback...</p>
      </div>
    );
  }

  if (testState === 'results' && evaluation) {
    return (
      <div className="h-full w-full overflow-y-auto p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
          
          <div className="flex-1 w-full space-y-6" id="report-content">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Results</h1>
              <div className="text-5xl font-black mb-4 text-black">{evaluation.total_score} <span className="text-2xl text-gray-400">/ 100</span></div>
              <p className="text-gray-600 text-lg">{evaluation.summary}</p>
            </div>

            <div className="space-y-6">
              {evaluation.evaluations.map((item, idx) => (
                <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg text-gray-900">Question {item.id}</h3>
                    <div className="bg-gray-100 text-gray-900 font-bold px-3 py-1 rounded-full text-sm">
                      {item.score} / 10
                    </div>
                  </div>
                  <div className="bg-red-50 text-red-900 p-4 rounded-xl text-sm leading-relaxed border border-red-100">
                    <span className="font-bold block mb-1">AI Feedback:</span>
                    {item.feedback}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full lg:w-80 shrink-0 sticky top-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4 text-center">
              <div className="text-gray-600 text-sm font-medium">
                The results are not stored! 
                <br />
                Download your report now before leaving this page.
              </div>
              <button 
                onClick={downloadReport}
                className="w-full bg-black hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                Download Report (PDF)
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // TESTING STATE
  return (
    <div ref={testContainerRef} className="h-screen bg-gray-50 flex flex-col overflow-hidden text-left relative w-full">
      
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10 relative">
        <div className="font-bold text-xl tracking-tight text-gray-900">Kyros <span className="text-gray-400">Practice Test</span></div>
        <div className="flex items-center gap-6">

          <button 
            onClick={submitTest}
            className="bg-black hover:bg-gray-800 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Submit Test
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-5xl mx-auto space-y-12 pb-24">
          
          {/* Descriptive Questions */}
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm">1</span>
              Conceptual Knowledge
            </h2>
            <div className="space-y-8">
              {questions?.descriptive?.map((q, idx) => (
                <div key={`desc-${q.id}`} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="font-medium text-gray-900 mb-4">{idx + 1}. {q.question}</div>
                  <textarea
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 focus:outline-none focus:ring-2 focus:ring-black min-h-[120px]"
                    placeholder="Type your detailed answer here..."
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Coding Questions */}
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-3 pt-8 border-t border-gray-200">
              <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm">2</span>
              Technical Implementation
            </h2>
            <div className="space-y-8">
              {questions?.coding?.map((q, idx) => (
                <div key={`code-${q.id}`} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${q.type === 'dsa' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {q.type}
                    </span>
                  </div>
                  <div className="font-medium text-gray-900 mb-2">{q.question}</div>
                  {q.example && <div className="text-sm bg-gray-100 p-3 rounded-lg mb-4 text-gray-700 font-mono text-[12px]">{q.example}</div>}
                  {q.schema && <div className="text-sm bg-gray-100 p-3 rounded-lg mb-4 text-gray-700 font-mono text-[12px]">{q.schema}</div>}
                  
                  <textarea
                    className="w-full bg-[#1e1e1e] border border-gray-800 rounded-xl p-4 text-gray-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 min-h-[200px]"
                    placeholder={q.type === 'sql' ? "-- Write your SQL query here..." : "// Write your code here..."}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    spellCheck="false"
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Agent4;
