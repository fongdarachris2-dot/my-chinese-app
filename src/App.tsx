import React, { useState, useEffect, useRef } from 'react';

import { initializeApp, type FirebaseApp } from 'firebase/app';

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  where,
  limit,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

//======================================================================
//   1. 型別定義 (來自 src/types/index.ts)
//======================================================================

// --- 基礎型別定義 ---
interface BaseQuestion {
  id: string;
  createdAt: Timestamp;
  explanation?: string;
  errorAnalysis?: Record<string, string>;
}

// --- 單選題型別 ---
interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single_choice';
  title: string;
  options: string[];
  correctAnswer: string;
}


// --- 多選題型別 ---
interface MultiSelectQuestion extends BaseQuestion {
  type: 'multi_select';
  title: string;
  options: string[];
  correctAnswers: string[];
}

// --- 閱讀測驗型別 ---
interface ReadingSubItem {
  id: string;
  subtype: "single_choice" | "multi_select";
  stem: string;
  options: string[];
  answer?: string;
  correctAnswers?: string[];
  explanation?: string;
  errorAnalysis?: Record<string, string>;
  evidenceRefs?: string[];
}

interface ReadingQuestion extends BaseQuestion {
  type: 'reading';
  passage: {
    title: string;
    textHtml: string;
    plainText?: string;
    audioUrl?: string;
  };
  items: ReadingSubItem[];
}

// --- 聯合型別 ---
type Question = SingleChoiceQuestion | MultiSelectQuestion | ReadingQuestion;

//======================================================================
//   2. 工具函式 (來自 src/lib/utils.ts)
//======================================================================

const normalizeChoiceArray = (choices: string[]): string[] => {
  return [...new Set(choices)].sort();
};

const isMultiCorrect = (chosen: string[], correct: string[]): boolean => {
  if (chosen.length !== correct.length) return false;
  for (let i = 0; i < chosen.length; i++) {
    if (chosen[i] !== correct[i]) return false;
  }
  return true;
};


//======================================================================
//   3. Firebase 與資源設定
//======================================================================

// --- Firebase 設定 ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID,
};

// --- 初始化 Firebase ---
let app!: FirebaseApp;
let auth!: Auth;
let db!: Firestore;


if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (error) {
        console.error("Firebase 初始化失敗:", error);
    }
}

// --- 圖示組件 ---
const icons = {
  book: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  brain: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  target: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 10-7.072 7.072m7.072-7.072l-7.072 7.072" /></svg>,
  user: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  logout: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  admin: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
};

//======================================================================
//   4. 元件定義
//======================================================================

// --- 單選題組件 (保留您原本的實作) ---
function SingleChoiceBlock(
  { data, number, userId }: { data: SingleChoiceQuestion, number: number, userId: string }
) {

    const [isSubmitted, setIsSubmitted] = useState(false);
    const [showDefinition, setShowDefinition] = useState(false);
    const [showTranslation, setShowTranslation] = useState(false);
    const [userAnswer, setUserAnswer] = useState<string | null>(null);

    const toggleText = (type: 'definition' | 'translation') => {
        if (type === 'definition') setShowDefinition(s => !s);
        if (type === 'translation') setShowTranslation(s => !s);
    };

    const readAloud = () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.title;
        let textToRead = `${number}. ${tempDiv.textContent}`;
        
        data.options.forEach((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            tempDiv.innerHTML = opt;
            const cleanText = tempDiv.textContent;
            textToRead += ` 選項 ${letter}： ${cleanText};`;
        });

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(textToRead);
            utterance.lang = 'zh-TW';
            window.speechSynthesis.speak(utterance);
        } else {
            alert('您的瀏覽器不支援語音朗讀功能。');
        }
    };

    const parseContent = (content: string) => {
        if (typeof document === 'undefined') return { __html: content };
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        tempDiv.querySelectorAll('.definition').forEach((el) => (el as HTMLElement).style.display = showDefinition ? 'inline' : 'none');
tempDiv.querySelectorAll('.translation').forEach((el) => (el as HTMLElement).style.display = showTranslation ? 'inline' : 'none');

        return { __html: tempDiv.innerHTML };
    };
    
    const checkAnswer = async () => {
        if (!userAnswer) { alert('請選擇一個答案！'); return; }
        setIsSubmitted(true);

        const isCorrect = userAnswer === data.correctAnswer;
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + (isCorrect ? 7 : 1));

        const historyRef = collection(db, 'users', userId, 'history');
        await addDoc(historyRef, {
            type: 'single_choice',
            questionId: data.id,
            chosen: userAnswer,
            isCorrect,
            hintLevel: 0,
            timestamp: serverTimestamp(),
            nextReviewDate: Timestamp.fromDate(nextReviewDate),
            userAnswer: userAnswer, 
            questionTitle: data.title,
        });
    };
    
    const resetQuestion = () => {
        setIsSubmitted(false);
        setUserAnswer(null);
    };

    const getOptionClass = (optionLetter: string) => {
        if (!isSubmitted) return 'hover:bg-gray-100 focus-within:ring-2 focus-within:ring-blue-400';
        if (data.correctAnswer === optionLetter) return 'bg-green-100 border-green-500';
        if (userAnswer === optionLetter) return 'bg-red-100 border-red-500';
        return 'bg-white';
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <p className="text-lg font-semibold mb-4" dangerouslySetInnerHTML={{ __html: `${number}. （　　）${data.title}` }} />
            <div className="space-y-3">
                {data.options.map((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    return (
                        <label key={letter} className={`p-3 border rounded-md cursor-pointer flex items-start ${getOptionClass(letter)}`}>
                            <input type="radio" name={data.id} value={letter} checked={userAnswer === letter} onChange={(e) => setUserAnswer(e.target.value)} disabled={isSubmitted} className="mr-3 mt-1 h-5 w-5" />
                            <span dangerouslySetInnerHTML={parseContent(`(${letter}) ${opt}`)} />
                        </label>
                    );
                })}
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
                <button onClick={() => toggleText('definition')} className="bg-gray-200 px-3 py-1 rounded-md text-sm">顯示/隱藏釋義</button>
                <button onClick={() => toggleText('translation')} className="bg-gray-200 px-3 py-1 rounded-md text-sm">顯示/隱藏翻譯</button>
                <button onClick={readAloud} className="bg-gray-500 text-white px-3 py-1 rounded-md text-sm">朗讀</button>
                {!isSubmitted ? (
                    <button onClick={checkAnswer} className="bg-green-500 text-white px-4 py-2 rounded-md">提交答案</button>
                ) : (
                    <button onClick={resetQuestion} className="bg-yellow-500 text-black px-4 py-2 rounded-md">重做此題</button>
                )}
            </div>
            {isSubmitted && (
                <div className="mt-4 p-4 bg-yellow-50 border-t">
                    <p className={`font-bold mb-2 ${userAnswer === data.correctAnswer ? 'text-green-600' : 'text-red-600'}`}>
                        {userAnswer === data.correctAnswer ? '回答正確！' : '回答錯誤。'}
                    </p>
                    <p><span className="font-semibold">✅ 正確答案：</span>{data.correctAnswer}</p>
{userAnswer !== data.correctAnswer && userAnswer && data.errorAnalysis && data.errorAnalysis[userAnswer] && (
  <p className="mt-2 text-red-700"><span className="font-semibold">🔍 錯因分析：</span>{data.errorAnalysis[userAnswer]}</p>
)}
                                      {data.explanation && (
                       <p className="mt-2"><span className="font-semibold">📖 詳細解析：</span><span dangerouslySetInnerHTML={{ __html: data.explanation }} /></p>
                    )}
                </div>
            )}
        </div>
    );
}

// --- 多選題組件 (新增) ---
function MultiSelectBlock(
  { data, number, userId }: { data: MultiSelectQuestion; number: number; userId: string }
) {
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [isCorrect, setIsCorrect] = React.useState<boolean | null>(null);

  const toggle = (opt: string) => {
    setChosen(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctSet = new Set(data.correctAnswers);
    const chosenSet = new Set(chosen);
    const ok = correctSet.size === chosenSet.size && [...correctSet].every(a => chosenSet.has(a));
    setIsCorrect(ok);
    setIsSubmitted(true);
  };

  return (
    <div className="p-4 border rounded-xl">
      <div className="mb-2 text-sm text-gray-500">第 {number} 題｜多選</div>
      <h3 className="font-semibold">{data.title}</h3>

      <form onSubmit={handleSubmit}>
        <ul className="mt-3 space-y-2">
          {data.options.map((opt, idx) => {
            const id = `q${data.id}-${idx}`;
            const checked = chosen.includes(opt);
            return (
              <li key={id} className="flex items-start gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                />
                <label htmlFor={id} className="select-none">
                  {String.fromCharCode(65 + idx)}. {opt}
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex gap-2 flex-wrap items-center">
          {!isSubmitted ? (
            <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded-md">
              提交答案
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setChosen([]);
                setIsCorrect(null);
              }}
              className="bg-yellow-500 text-black px-4 py-2 rounded-md"
            >
              重做此題
            </button>
          )}
        </div>
      </form>

      {isSubmitted && (
        <div className="mt-4">
          {isCorrect ? (
            <p className="text-green-700">✅ 正確！</p>
          ) : (
            <p className="text-red-700">❌ 部分或全部錯誤。</p>
          )}

          {/* 錯因分析（若有） */}
          {!isCorrect && data.errorAnalysis && chosen.length > 0 && (
            <div className="mt-2 space-y-1">
              {chosen.map(opt =>
                data.errorAnalysis![opt] ? (
                  <p key={opt} className="text-red-700">
                    <span className="font-semibold">🔍 {opt} 的錯因：</span>
                    {data.errorAnalysis![opt]}
                  </p>
                ) : null
              )}
            </div>
          )}

          {/* 詳細解析（若有） */}
          {data.explanation && (
            <p className="mt-2">
              <span className="font-semibold">📖 詳細解析：</span>
              <span dangerouslySetInnerHTML={{ __html: data.explanation }} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
// --- 閱讀測驗組件 (新增) ---
function ReadingBlock({ data, number, userId }: { data: ReadingQuestion, number: number, userId: string }) {
  const [submissions, setSubmissions] = useState<Record<string, { isCorrect: boolean }>>({});
  const [highlightedRefs, setHighlightedRefs] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  const handleSubItemFocus = (itemId: string) => {
    const currentItem = data.items.find(i => i.id === itemId);
    setHighlightedRefs(currentItem?.evidenceRefs || []);
  };
  
  const handleSubmission = (subItemId: string, isCorrect: boolean) => {
    setSubmissions(prev => ({ ...prev, [subItemId]: { isCorrect } }));
  };

  useEffect(() => {
    const passageEl = passageRef.current;
    if (!passageEl) return;
    passageEl.querySelectorAll('[data-highlighted="true"]').forEach(el => {
      el.removeAttribute('data-highlighted');
      el.classList.remove('bg-yellow-200', 'transition-colors', 'duration-300', 'ease-in-out', 'rounded', 'px-1', 'py-0.5', 'box-decoration-clone');
    });
    highlightedRefs.forEach(refId => {
      const el = passageEl.querySelector(`[data-id="${refId}"]`) as HTMLElement;
      if (el) {
        el.setAttribute('data-highlighted', 'true');
        el.classList.add('bg-yellow-200', 'transition-colors', 'duration-300', 'ease-in-out', 'rounded', 'px-1', 'py-0.5', 'box-decoration-clone');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [highlightedRefs]);

  useEffect(() => {
    const passageEl = passageRef.current;
    if (!passageEl) return;
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.dataset.term) {
        const rect = target.getBoundingClientRect();
        setTooltip({ content: target.dataset.term, x: rect.left + window.scrollX, y: rect.top + window.scrollY - 10 });
      }
    };
    const handleMouseOut = () => setTooltip(null);
    passageEl.addEventListener('mouseover', handleMouseOver);
    passageEl.addEventListener('mouseout', handleMouseOut);
    return () => {
      passageEl.removeEventListener('mouseover', handleMouseOver);
      passageEl.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);

  const SubQuestion = ({ item, isSubmitted: parentIsSubmitted }: {item: ReadingSubItem, isSubmitted: boolean}) => {
    const [chosen, setChosen] = useState<string[]>([]);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [localIsSubmitted, setLocalIsSubmitted] = useState(parentIsSubmitted);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (chosen.length === 0) { alert('請選擇答案！'); return; }
      let correct: boolean;
      let chosenPayload: string | string[];
      if (item.subtype === 'multi_select') {
        const normalizedUser = normalizeChoiceArray(chosen);
        const normalizedCorrect = normalizeChoiceArray(item.correctAnswers || []);
        correct = isMultiCorrect(normalizedUser, normalizedCorrect);
        chosenPayload = normalizedUser;
      } else {
        chosenPayload = chosen[0];
        correct = chosenPayload === item.answer;
      }
      setIsCorrect(correct);
      setLocalIsSubmitted(true);
      handleSubmission(item.id, correct);
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + (correct ? 7 : 1));
      try {
        await addDoc(collection(db, 'users', userId, 'history'), { type: 'reading', questionId: data.id, subItemId: item.id, chosen: chosenPayload, isCorrect: correct, hintLevel: 0, timestamp: serverTimestamp(), nextReviewDate: Timestamp.fromDate(nextReviewDate) });
      } catch (error) { console.error("寫入閱讀題歷史紀錄失敗:", error); }
    };

    const handleSelection = (optionLetter: string) => {
      if (item.subtype === 'single_choice') setChosen([optionLetter]);
      else setChosen(prev => { const newSet = new Set(prev); if (newSet.has(optionLetter)) newSet.delete(optionLetter); else newSet.add(optionLetter); return [...newSet]; });
    };

    const getOptionClass = (letter: string) => {
      if (!localIsSubmitted) return 'hover:bg-gray-100';
      const correctAnswers = item.subtype === 'multi_select' ? item.correctAnswers : [item.answer];
      if (correctAnswers?.includes(letter)) return 'bg-green-100 border-green-500';
      if (chosen.includes(letter)) return 'bg-red-100 border-red-500';
      return 'bg-white';
    };

    return (
      <div className={`p-4 border rounded-lg ${localIsSubmitted ? 'bg-gray-50' : 'bg-white'}`} onFocus={() => handleSubItemFocus(item.id)} tabIndex={-1}>
        <form onSubmit={handleSubmit}>
          <p className="font-medium mb-3">{item.stem}</p>
          <div className="space-y-2">
            {item.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return (
                <label key={letter} className={`p-2 border rounded-md cursor-pointer flex items-start text-sm ${getOptionClass(letter)}`}>
                  <input type={item.subtype === 'multi_select' ? 'checkbox' : 'radio'} name={item.id} value={letter} checked={chosen.includes(letter)} onChange={() => handleSelection(letter)} disabled={localIsSubmitted} className="mr-3 mt-1 h-4 w-4" />
                  <span>{`(${letter}) ${opt}`}</span>
                </label>
              );
            })}
          </div>
          {!localIsSubmitted && <button type="submit" className="mt-3 w-full bg-blue-500 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">提交此題</button>}
        </form>
        {localIsSubmitted && (
          <div className="mt-3 pt-3 border-t">
            <p className={`font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>{isCorrect ? '回答正確' : '回答錯誤'}</p>
            <p className="text-sm"><span className="font-semibold">正解：</span>{item.subtype === 'multi_select' ? normalizeChoiceArray(item.correctAnswers || []).join('、') : item.answer}</p>
            {item.explanation && <p className="text-sm mt-1"><span className="font-semibold">解析：</span>{item.explanation}</p>}
          </div>
        )}
      </div>
    );
  };

  const totalItems = data.items.length;
  const completedItems = Object.keys(submissions).length;
  const correctItems = Object.values(submissions).filter(s => s.isCorrect).length;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md ring-1 ring-black ring-opacity-5">
      <h2 className="text-xl font-bold mb-4">{`${number}. 閱讀測驗：${data.passage.title}`}</h2>
      {tooltip && <div className="absolute z-50 p-2 text-sm bg-gray-800 text-white rounded-md shadow-lg -translate-y-full pointer-events-none" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">{tooltip.content}</div>}
      <div className="flex flex-col lg:flex-row gap-8">
        <article ref={passageRef} className="lg:w-1/2 prose max-w-none prose-sm sm:prose-base leading-relaxed"><div dangerouslySetInnerHTML={{ __html: data.passage.textHtml }} /></article>
        <aside className="lg:w-1/2 space-y-4">{data.items.map((item) => <div key={item.id}><SubQuestion item={item} isSubmitted={!!submissions[item.id]} /></div>)}</aside>
      </div>
      <div className="mt-6 pt-4 border-t-2">
        <h3 className="font-semibold text-lg">本題組作答進度</h3>
        <div className="flex justify-around items-center text-center mt-2 p-3 bg-gray-100 rounded-lg">
          <div><p className="text-2xl font-bold">{completedItems} / {totalItems}</p><p className="text-xs text-gray-600">已完成題數</p></div>
          <div><p className="text-2xl font-bold text-green-600">{correctItems}</p><p className="text-xs text-gray-600">答對題數</p></div>
          <div><p className="text-2xl font-bold text-blue-600">{totalItems > 0 ? ((completedItems / totalItems) * 100).toFixed(0) : 0}%</p><p className="text-xs text-gray-600">完成率</p></div>
        </div>
      </div>
    </div>
  );
}


// --- 題目渲染器 ---
function QuestionRenderer(
  { questionData, number, userId }: { questionData: any; number: number; userId: string }
) {
  const type = questionData.type ?? 'single_choice';

  switch (type) {
    case 'multi_select':
      return (
        <MultiSelectBlock
          data={questionData}
          number={number}
          userId={userId}
        />
      );

    case 'reading':
      return (
        <ReadingBlock
          data={questionData}
          number={number}
          userId={userId}
        />
      );

    case 'single_choice':
    default:
      return (
        <SingleChoiceBlock
          data={questionData as SingleChoiceQuestion}
          number={number}
          userId={userId}
        />
      );
  }
}
// --- 練習模組 ---
function PracticeModule({userId}: {userId: string}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        setQuestions(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
      } catch (err) { console.error("讀取題目失敗:", err); } 
      finally { setLoading(false); }
    };
    fetchQuestions();
  }, [userId]);
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">智慧測驗</h2>
      {loading && <p>載入題目中...</p>}
      {!loading && questions.length === 0 && <p>目前題庫無題目。</p>}
      <div className="space-y-8">{questions.map((q, index) => <QuestionRenderer key={q.id} questionData={q} number={index + 1} userId={userId} />)}</div>
    </div>
  );
}

// --- 分析模組 ---
function AnalysisModule({ userId }: {userId: string}) {
  const [stats, setStats] = useState<{total: number, correct: number, accuracy: string} | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const historyRef = collection(db, 'users', userId, 'history');
      const querySnapshot = await getDocs(historyRef);
      let total = 0, correct = 0;
      querySnapshot.forEach(doc => { total++; if (doc.data().isCorrect) correct++; });
      setStats({ total, correct, accuracy: total > 0 ? (correct / total * 100).toFixed(1) : "0" });
      setLoading(false);
    };
    fetchData();
  }, [userId]);
  if (loading) return <p>分析報告生成中...</p>;
  if (!stats || stats.total === 0) return <p>尚無作答紀錄，請先至「智慧測驗」練習。</p>;
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">學習分析</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow text-center"><p className="text-sm text-gray-500">總答題數</p><p className="text-4xl font-bold">{stats.total}</p></div>
        <div className="bg-white p-6 rounded-lg shadow text-center"><p className="text-sm text-gray-500">總正確率</p><p className="text-4xl font-bold text-green-600">{stats.accuracy}%</p></div>
      </div>
    </div>
  );
}

// --- 複習模組 ---
function ReinforcementModule({ userId }: {userId: string}) {
    const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchReviewData = async () => {
            setLoading(true);
            try {
                const today = Timestamp.now();
                const historyRef = collection(db, 'users', userId, 'history');
                const q = query(historyRef, where('nextReviewDate', '<=', today), orderBy('nextReviewDate'), limit(10));
                const historySnapshot = await getDocs(q);
                if (historySnapshot.empty) { setReviewQuestions([]); setLoading(false); return; }
                const questionIds = [...new Set(historySnapshot.docs.map(doc => doc.data().questionId))];
                if (questionIds.length > 0) {
                  const questionsRef = collection(db, 'questions');
                  const questionsQuery = query(questionsRef, where('__name__', 'in', questionIds));
                  const questionSnapshot = await getDocs(questionsQuery);
                  setReviewQuestions(questionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
                } else {
                  setReviewQuestions([]);
                }
            } catch (err) { 
                console.error("讀取複習題目失敗:", err); 
                setReviewQuestions([]);
            } 
            finally { setLoading(false); }
        };
        fetchReviewData();
    }, [userId]);
    if (loading) return <p>正在為您準備複習計畫...</p>;
    if (reviewQuestions.length === 0) return <p>今日無待複習題目，請繼續保持！</p>;
    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">個人化強化複習</h2>
            <div className="space-y-8">{reviewQuestions.map((q, index) => <QuestionRenderer key={q.id} questionData={q} number={index + 1} userId={userId} />)}</div>
        </div>
    );
}

// --- 管理員後台模組 ---
function AdminModule() {
  const [pastedContent, setPastedContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = pastedContent;
        const plainText = tempDiv.textContent || "";
        if (!plainText.includes('正確答案：')) throw new Error("找不到 '✅ 正確答案：' 標記。");
        if (!plainText.includes('詳解：')) throw new Error("找不到 '📖 詳解：' 標記。");
        const errorParts = pastedContent.split(/🔍/i);
        const mainBlockHtml = errorParts[0];
        const errorAnalysisHtml = errorParts.length > 1 ? errorParts[1] : '';
        const explanationParts = mainBlockHtml.split(/📖/i);
        const explanation = explanationParts[1]?.replace('詳解：', '').trim() || '';
        const contentBeforeExplanationHtml = explanationParts[0];
        const answerMatch = plainText.match(/✅\s*正確答案：\s*([A-Z])/i);
        if (!answerMatch) throw new Error("無法解析正確答案，請確認格式為 '✅ 正確答案：C'");
        const correctAnswer = answerMatch[1].toUpperCase();
        const contentBeforeAnswerHtml = contentBeforeExplanationHtml.split(/✅/i)[0].trim();
        const optionRegex = /\(\s*[A-Z]\s*\)/;
        const firstOptionMatchIndex = contentBeforeAnswerHtml.search(optionRegex);
        if (firstOptionMatchIndex === -1) throw new Error("在題目內容中找不到任何選項標記，例如 (A)。");
        const title = contentBeforeAnswerHtml.substring(0, firstOptionMatchIndex).replace(/^[0-9]+\.\s*（\s*　\s*）/, '').trim();
        const optionsBlockHtml = contentBeforeAnswerHtml.substring(firstOptionMatchIndex);
        const options = optionsBlockHtml.split(/\(\s*[A-Z]\s*\)/).slice(1).map(opt => opt.trim());
        const errorAnalysisObject: Record<string, string> = {};
        if (errorAnalysisHtml) {
          (errorAnalysisHtml.replace('錯因分析：','').trim()).split('\n').forEach(line => {
            const parts = line.split(/[:：]/);
            if (parts.length === 2 && ['A', 'B', 'C', 'D', 'E'].includes(parts[0].trim().toUpperCase())) {
              errorAnalysisObject[parts[0].trim().toUpperCase()] = parts[1].trim();
            }
          });
        }
        await addDoc(collection(db, 'questions'), { type: 'single_choice', title, options, correctAnswer, explanation, errorAnalysis: errorAnalysisObject, createdAt: serverTimestamp() });
        setMessage('成功新增題目！');
        setPastedContent('');
    } catch (error) { 
        if (error instanceof Error) {
            setMessage(`新增失敗: ${error.message}`);
        } else {
            setMessage(`新增失敗: 發生未知錯誤`);
        }
    } 
    finally { setIsSubmitting(false); }
  };
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">管理員後台 - 智慧產生器 (單選題)</h2>
      {message && <p className={`p-3 rounded-md mb-4 ${message.startsWith('成功') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message}</p>}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
        <textarea
  value={pastedContent}
  onChange={(e) => setPastedContent(e.target.value)}
  rows={20}
  className="w-full p-2 border rounded-md font-mono text-sm"
  placeholder="請將完整題目內容貼於此處..."
/>

        <button type="submit" disabled={isSubmitting} className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded disabled:bg-green-300">{isSubmitting ? '處理中...' : '智慧產生並存入資料庫'}</button>
      </form>
    </div>
  );
}

// --- 主應用程式組件 (骨架) ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('practice');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!auth) {
        setLoading(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const adminDocRef = doc(db, 'admins', currentUser.uid);
        const adminDocSnap = await getDoc(adminDocRef);
        setIsAdmin(adminDocSnap.exists());
        setUser(currentUser);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('註冊失敗：這個電子郵件已經被註冊了。');
      else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') setError('登入失敗：電子郵件或密碼錯誤。');
      else setError("發生未知錯誤，請稍後再試。");
    } finally { setIsSubmitting(false); }
  };

  const handleLogout = async () => { await signOut(auth); setPage('practice'); };

  const renderContent = () => {
    if (!user) return null;
    switch (page) {
      case 'practice': return <PracticeModule userId={user.uid} />;
      case 'analysis': return <AnalysisModule userId={user.uid} />;
      case 'reinforcement': return <ReinforcementModule userId={user.uid} />;
      case 'admin': return isAdmin ? <AdminModule /> : <p>權限不足。</p>;
      default: return <PracticeModule userId={user.uid} />;
    }
  };

  if (!app) return <div className="min-h-screen bg-red-100 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-lg shadow-lg border-4 border-red-500"><h1 className="text-3xl font-bold text-center text-red-700">系統設定錯誤</h1><p className="text-center text-gray-700 mt-4">您尚未在程式碼中設定有效的 Firebase 金鑰。</p></div></div>
  
  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-100"><div className="text-xl font-bold">載入中...</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2">高中國文智慧取分系統</h1>
          <p className="text-center text-gray-500 mb-6">{authMode === 'login' ? '登入您的帳號' : '建立新帳號'}</p>
          <form onSubmit={handleAuth}>
            <div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">電子郵件</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required /></div>
            <div className="mb-6"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">密碼</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" required /></div>
            {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
            <div className="flex items-center justify-between">
              <button type="submit" disabled={isSubmitting} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:bg-blue-300">{isSubmitting ? '處理中...' : (authMode === 'login' ? '登入' : '註冊')}</button>
              <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode(authMode === 'login' ? 'signup' : 'login');}} className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800">{authMode === 'login' ? '還沒有帳號？註冊' : '已經有帳號？登入'}</a>
            </div>
          </form>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <style>{`.definition { color: #d9534f; } .translation { color: #0275d8; } .prose { max-width: 65ch; }`}</style>
      <div className="flex h-screen bg-gray-100 font-sans">
        <aside className="w-64 bg-white shadow-md flex flex-col flex-shrink-0">
          <div className="p-6 border-b"><h1 className="text-2xl font-bold text-gray-800">智慧取分系統</h1><p className="text-sm text-gray-500">龍騰版高中國文</p></div>
          <nav className="flex-1 px-4 py-4">
            <a href="#" onClick={(e) => {e.preventDefault(); setPage('practice');}} className={`flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-200 ${page === 'practice' ? 'bg-gray-200' : ''}`}>{icons.book} <span className="ml-3">智慧測驗</span></a>
            <a href="#" onClick={(e) => {e.preventDefault(); setPage('analysis');}} className={`flex items-center px-4 py-2 mt-2 text-gray-700 rounded-md hover:bg-gray-200 ${page === 'analysis' ? 'bg-gray-200' : ''}`}>{icons.brain} <span className="ml-3">學習分析</span></a>
            <a href="#" onClick={(e) => {e.preventDefault(); setPage('reinforcement');}} className={`flex items-center px-4 py-2 mt-2 text-gray-700 rounded-md hover:bg-gray-200 ${page === 'reinforcement' ? 'bg-gray-200' : ''}`}>{icons.target} <span className="ml-3">個人化強化複習</span></a>
            {isAdmin && (<a href="#" onClick={(e) => {e.preventDefault(); setPage('admin');}} className={`flex items-center px-4 py-2 mt-5 text-red-700 rounded-md hover:bg-red-100 ${page === 'admin' ? 'bg-red-100' : ''}`}>{icons.admin} <span className="ml-3">管理員後台</span></a>)}
          </nav>
          <div className="p-4 border-t">
            <div className="flex items-center">{icons.user}<span className="ml-3 text-sm font-semibold">{user.email}</span></div>
            <button onClick={handleLogout} className="flex items-center w-full px-4 py-2 mt-4 text-sm text-gray-600 rounded-md hover:bg-gray-200">{icons.logout}<span className="ml-3">登出</span></button>
          </div>
        </aside>
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto">{renderContent()}</main>
      </div>
    </>
  );
}