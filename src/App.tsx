import React, { useEffect, useRef, useState } from 'react';

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
  deleteDoc,            // ⬅️ 用於刪題
  type Firestore,
  type DocumentData,
} from 'firebase/firestore';

/* =========================================================================
   1) 型別定義
   ========================================================================= */
interface BaseQuestion {
  id: string;
  createdAt: Timestamp;
  explanation?: string;
  errorAnalysis?: Record<string, string>;
}
interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single_choice';
  title: string;          // 題幹（可含 HTML：.definition / .translation）
  options: string[];      // 選項（可含 HTML）
  correctAnswer: string;  // 'A' | 'B' | ...
}
interface MultiSelectQuestion extends BaseQuestion {
  type: 'multi_select';
  title: string;
  options: string[];
  correctAnswers: string[]; // 如 ['A','C']
}
interface ReadingSubItem {
  id: string;
  subtype: 'single_choice' | 'multi_select';
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
type Question = SingleChoiceQuestion | MultiSelectQuestion | ReadingQuestion;

/* =========================================================================
   2) 工具
   ========================================================================= */
const normalizeChoiceArray = (choices: string[]): string[] =>
  [...new Set(choices)].sort();

const isMultiCorrect = (chosen: string[], correct: string[]): boolean => {
  if (chosen.length !== correct.length) return false;
  for (let i = 0; i < chosen.length; i++) if (chosen[i] !== correct[i]) return false;
  return true;
};

/* =========================================================================
   3) Firebase 初始化（沿用你的 .env 設定；若你已寫死也可替換成常數）
   ========================================================================= */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID,
};

let app!: FirebaseApp;
let auth!: Auth;
let db!: Firestore;
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

/* =========================================================================
   4) 圖示（純前端）
   ========================================================================= */
const icons = {
  book: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  brain: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  target: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.536 8.464a5 5 0 10-7.072 7.072m7.072-7.072l-7.072 7.072" />
    </svg>
  ),
  user: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  logout: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  admin: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

/* =========================================================================
   5) 題目呈現元件
   ========================================================================= */
function SingleChoiceBlock({
  data, number, userId,
}: { data: SingleChoiceQuestion; number: number; userId: string }) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);

  const toggleText = (which: 'definition' | 'translation') => {
    if (which === 'definition') setShowDefinition(v => !v);
    else setShowTranslation(v => !v);
  };

  const parseContent = (content: string) => {
    const div = document.createElement('div');
    div.innerHTML = content;
    div.querySelectorAll('.definition').forEach(el => {
      (el as HTMLElement).style.display = showDefinition ? 'inline' : 'none';
    });
    div.querySelectorAll('.translation').forEach(el => {
      (el as HTMLElement).style.display = showTranslation ? 'inline' : 'none';
    });
    return { __html: div.innerHTML };
  };

  const readAloud = () => {
    const div = document.createElement('div');
    div.innerHTML = data.title;
    let text = `${number}. ${div.textContent ?? ''}`;
    data.options.forEach((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      div.innerHTML = opt;
      text += ` 選項 ${letter}：${div.textContent ?? ''}；`;
    });
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      window.speechSynthesis.speak(u);
    } else {
      alert('此瀏覽器不支援語音朗讀。');
    }
  };

  const checkAnswer = async () => {
    if (!userAnswer) return alert('請先選一個答案');
    setIsSubmitted(true);

    const correct = userAnswer === data.correctAnswer;
    const next = new Date();
    next.setDate(next.getDate() + (correct ? 7 : 1));

    await addDoc(collection(db, 'users', userId, 'history'), {
      type: 'single_choice',
      questionId: data.id,
      chosen: userAnswer,
      isCorrect: correct,
      hintLevel: 0,
      timestamp: serverTimestamp(),
      nextReviewDate: Timestamp.fromDate(next),
      questionTitle: data.title,
    });
  };

  const optionStyle = (letter: string) => {
    if (!isSubmitted) return 'hover:bg-gray-100 focus-within:ring-2 focus-within:ring-blue-400';
    if (letter === data.correctAnswer) return 'bg-green-100 border-green-500';
    if (letter === userAnswer) return 'bg-red-100 border-red-500';
    return 'bg-white';
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <p className="text-lg font-semibold mb-4" dangerouslySetInnerHTML={{ __html: `${number}. （　　）${data.title}` }} />
      <div className="space-y-3">
        {data.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          return (
            <label key={letter} className={`p-3 border rounded-md cursor-pointer flex items-start ${optionStyle(letter)}`}>
              <input
                type="radio"
                name={data.id}
                value={letter}
                checked={userAnswer === letter}
                onChange={e => setUserAnswer(e.target.value)}
                disabled={isSubmitted}
                className="mr-3 mt-1 h-5 w-5"
              />
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
          <button onClick={checkAnswer} className="bg-green-600 text-white px-4 py-2 rounded-md">提交答案</button>
        ) : (
          <button onClick={() => { setIsSubmitted(false); setUserAnswer(null); }} className="bg-yellow-500 text-black px-4 py-2 rounded-md">重做此題</button>
        )}
      </div>

      {isSubmitted && (
        <div className="mt-4 p-4 bg-yellow-50 border-t">
          <p className={`font-bold mb-2 ${userAnswer === data.correctAnswer ? 'text-green-600' : 'text-red-600'}`}>
            {userAnswer === data.correctAnswer ? '回答正確！' : '回答錯誤。'}
          </p>
          <p><span className="font-semibold">✅ 正確答案：</span>{data.correctAnswer}</p>
          {userAnswer !== data.correctAnswer && userAnswer && data.errorAnalysis?.[userAnswer] && (
            <p className="mt-2 text-red-700"><span className="font-semibold">🔍 錯因分析：</span>{data.errorAnalysis[userAnswer]}</p>
          )}
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

function MultiSelectBlock({
  data, number, userId,
}: { data: MultiSelectQuestion; number: number; userId: string }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const toggle = (opt: string) =>
    setChosen(prev => (prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0) return alert('請至少選一個選項');

    const ok = isMultiCorrect(normalizeChoiceArray(chosen), normalizeChoiceArray(data.correctAnswers));
    setIsCorrect(ok);
    setIsSubmitted(true);

    const next = new Date();
    next.setDate(next.getDate() + (ok ? 7 : 1));
    await addDoc(collection(db, 'users', userId, 'history'), {
      type: 'multi_select',
      questionId: data.id,
      chosen: normalizeChoiceArray(chosen),
      isCorrect: ok,
      hintLevel: 0,
      timestamp: serverTimestamp(),
      nextReviewDate: Timestamp.fromDate(next),
    });
  };

  const optCls = (letter: string) => {
    if (!isSubmitted) return 'hover:bg-gray-100';
    if (data.correctAnswers.includes(letter)) return 'bg-green-100 border-green-500';
    if (chosen.includes(letter) && !data.correctAnswers.includes(letter)) return 'bg-red-100 border-red-500';
    return 'bg-white';
  };

  return (
    <div className="p-6 border rounded-xl bg-white shadow-sm">
      <div className="mb-2 text-sm text-gray-500">第 {number} 題｜多選</div>
      <div className="font-semibold mb-3">{data.title}</div>

      <form onSubmit={handleSubmit}>
        <ul className="space-y-2">
          {data.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const id = `${data.id}-${letter}`;
            const checked = chosen.includes(letter);
            return (
              <li key={id} className={`p-2 border rounded-md flex items-start gap-2 ${optCls(letter)}`}>
                <input id={id} type="checkbox" checked={checked} onChange={() => toggle(letter)} className="mt-1" />
                <label htmlFor={id} className="select-none">{`${letter}. ${opt}`}</label>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex gap-2">
          {!isSubmitted ? (
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-md">提交答案</button>
          ) : (
            <button type="button" className="bg-yellow-500 text-black px-4 py-2 rounded-md"
                    onClick={() => { setIsSubmitted(false); setChosen([]); setIsCorrect(null); }}>
              重做此題
            </button>
          )}
        </div>
      </form>

      {isSubmitted && (
        <div className="mt-3">
          {isCorrect ? <p className="text-green-700">✅ 正確！</p> : <p className="text-red-700">❌ 有誤。</p>}
          {!isCorrect && data.errorAnalysis && (
            <div className="mt-2 space-y-1 text-sm">
              {Object.entries(data.errorAnalysis).map(([k, v]) =>
                <p key={k}><span className="font-semibold">{k}</span>：{v}</p>
              )}
            </div>
          )}
          {data.explanation && (
            <p className="mt-2 text-sm">
              <span className="font-semibold">📖 詳細解析：</span>
              <span dangerouslySetInnerHTML={{ __html: data.explanation }} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReadingBlock({
  data, number, userId,
}: { data: ReadingQuestion; number: number; userId: string }) {
  const [submissions, setSubmissions] = useState<Record<string, { isCorrect: boolean }>>({});
  const [highlightedRefs, setHighlightedRefs] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  const handleSubItemFocus = (itemId: string) => {
    const cur = data.items.find(i => i.id === itemId);
    setHighlightedRefs(cur?.evidenceRefs || []);
  };
  const handleSubmission = (id: string, ok: boolean) =>
    setSubmissions(prev => ({ ...prev, [id]: { isCorrect: ok } }));

  useEffect(() => {
    const el = passageRef.current;
    if (!el) return;
    el.querySelectorAll('[data-highlighted="true"]').forEach(x => {
      x.removeAttribute('data-highlighted');
      x.classList.remove('bg-yellow-200', 'rounded', 'px-1', 'py-0.5');
    });
    highlightedRefs.forEach(id => {
      const t = el.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
      if (t) {
        t.setAttribute('data-highlighted', 'true');
        t.classList.add('bg-yellow-200', 'rounded', 'px-1', 'py-0.5');
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [highlightedRefs]);

  useEffect(() => {
    const el = passageRef.current;
    if (!el) return;
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.dataset.term) {
        const r = t.getBoundingClientRect();
        setTooltip({ content: t.dataset.term, x: r.left + window.scrollX, y: r.top + window.scrollY - 10 });
      }
    };
    const out = () => setTooltip(null);
    el.addEventListener('mouseover', over);
    el.addEventListener('mouseout', out);
    return () => { el.removeEventListener('mouseover', over); el.removeEventListener('mouseout', out); };
  }, []);

  const SubQ = ({ item, isSubmitted: parentSubmitted }: { item: ReadingSubItem; isSubmitted: boolean }) => {
    const [chosen, setChosen] = useState<string[]>([]);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [localSubmitted, setLocalSubmitted] = useState(parentSubmitted);

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (chosen.length === 0) return alert('請選擇答案');

      let ok = false;
      let payload: string | string[];
      if (item.subtype === 'multi_select') {
        const u = normalizeChoiceArray(chosen);
        const c = normalizeChoiceArray(item.correctAnswers || []);
        ok = isMultiCorrect(u, c);
        payload = u;
      } else {
        payload = chosen[0];
        ok = payload === item.answer;
      }

      setIsCorrect(ok);
      setLocalSubmitted(true);
      handleSubmission(item.id, ok);

      const next = new Date();
      next.setDate(next.getDate() + (ok ? 7 : 1));
      await addDoc(collection(db, 'users', userId, 'history'), {
        type: 'reading',
        questionId: data.id,
        subItemId: item.id,
        chosen: payload,
        isCorrect: ok,
        hintLevel: 0,
        timestamp: serverTimestamp(),
        nextReviewDate: Timestamp.fromDate(next),
      });
    };

    const setChoice = (letter: string) => {
      if (item.subtype === 'single_choice') setChosen([letter]);
      else setChosen(prev => {
        const s = new Set(prev);
        s.has(letter) ? s.delete(letter) : s.add(letter);
        return [...s];
      });
    };

    const optCls = (letter: string) => {
      if (!localSubmitted) return 'hover:bg-gray-100';
      const corrects = item.subtype === 'multi_select' ? item.correctAnswers : [item.answer];
      if (corrects?.includes(letter)) return 'bg-green-100 border-green-500';
      if (chosen.includes(letter)) return 'bg-red-100 border-red-500';
      return 'bg-white';
    };

    return (
      <div className={`p-4 border rounded-lg ${localSubmitted ? 'bg-gray-50' : 'bg-white'}`} onFocus={() => handleSubItemFocus(item.id)} tabIndex={-1}>
        <form onSubmit={submit}>
          <p className="font-medium mb-3">{item.stem}</p>
          <div className="space-y-2">
            {item.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return (
                <label key={letter} className={`p-2 border rounded-md cursor-pointer flex items-start text-sm ${optCls(letter)}`}>
                  <input
                    type={item.subtype === 'multi_select' ? 'checkbox' : 'radio'}
                    name={item.id}
                    value={letter}
                    checked={chosen.includes(letter)}
                    onChange={() => setChoice(letter)}
                    disabled={localSubmitted}
                    className="mr-3 mt-1 h-4 w-4"
                  />
                  <span>{`(${letter}) ${opt}`}</span>
                </label>
              );
            })}
          </div>
          {!localSubmitted && (
            <button type="submit" className="mt-3 w-full bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm">提交此題</button>
          )}
        </form>

        {localSubmitted && (
          <div className="mt-3 pt-3 border-t">
            <p className={`font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>{isCorrect ? '回答正確' : '回答錯誤'}</p>
            <p className="text-sm">
              <span className="font-semibold">正解：</span>
              {item.subtype === 'multi_select'
                ? normalizeChoiceArray(item.correctAnswers || []).join('、')
                : item.answer}
            </p>
            {item.explanation && <p className="text-sm mt-1"><span className="font-semibold">解析：</span>{item.explanation}</p>}
          </div>
        )}
      </div>
    );
  };

  const total = data.items.length;
  const completed = Object.keys(submissions).length;
  const correctCnt = Object.values(submissions).filter(s => s.isCorrect).length;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <h2 className="text-xl font-bold mb-4">{`${number}. 閱讀測驗：${data.passage.title}`}</h2>

      {tooltip && (
        <div className="absolute z-50 p-2 text-sm bg-gray-800 text-white rounded-md -translate-y-full pointer-events-none"
             style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <article ref={passageRef} className="lg:w-1/2 prose max-w-none prose-sm sm:prose-base leading-relaxed">
          <div dangerouslySetInnerHTML={{ __html: data.passage.textHtml }} />
        </article>
        <aside className="lg:w-1/2 space-y-4">
          {data.items.map(item => <div key={item.id}><SubQ item={item} isSubmitted={!!submissions[item.id]} /></div>)}
        </aside>
      </div>

      <div className="mt-6 pt-4 border-t-2">
        <h3 className="font-semibold text-lg">本題組作答進度</h3>
        <div className="flex justify-around items-center text-center mt-2 p-3 bg-gray-100 rounded-lg">
          <div><p className="text-2xl font-bold">{completed} / {total}</p><p className="text-xs text-gray-600">已完成</p></div>
          <div><p className="text-2xl font-bold text-green-600">{correctCnt}</p><p className="text-xs text-gray-600">答對</p></div>
          <div><p className="text-2xl font-bold text-blue-600">{total ? Math.round(completed / total * 100) : 0}%</p><p className="text-xs text-gray-600">完成率</p></div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   6) 題目渲染器 & 模組
   ========================================================================= */
function QuestionRenderer({
  questionData, number, userId,
}: { questionData: any; number: number; userId: string }) {
  const type = questionData.type ?? 'single_choice';
  switch (type) {
    case 'multi_select': return <MultiSelectBlock data={questionData} number={number} userId={userId} />;
    case 'reading':      return <ReadingBlock data={questionData} number={number} userId={userId} />;
    case 'single_choice':
    default:             return <SingleChoiceBlock data={questionData as SingleChoiceQuestion} number={number} userId={userId} />;
  }
}

function PracticeModule({ userId }: { userId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qy = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(qy);
        setQuestions(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    run();
  }, [userId]);

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">智慧測驗</h2>
      {loading && <p>載入題目中…</p>}
      {!loading && questions.length === 0 && <p>目前題庫沒有題目。</p>}
      <div className="space-y-8">
        {questions.map((q, i) => <QuestionRenderer key={q.id} questionData={q} number={i + 1} userId={userId} />)}
      </div>
    </div>
  );
}

function AnalysisModule({ userId }: { userId: string }) {
  const [stats, setStats] = useState<{ total: number; correct: number; accuracy: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users', userId, 'history'));
      let total = 0, correct = 0;
      snap.forEach(d => { total++; if ((d.data() as any).isCorrect) correct++; });
      setStats({ total, correct, accuracy: total ? (correct / total * 100).toFixed(1) : '0.0' });
      setLoading(false);
    };
    run();
  }, [userId]);

  if (loading) return <p>分析報告生成中…</p>;
  if (!stats || stats.total === 0) return <p>尚無作答紀錄，請先到「智慧測驗」。</p>;

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">學習分析</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-sm text-gray-500">總答題數</p>
          <p className="text-4xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-sm text-gray-500">總正確率</p>
          <p className="text-4xl font-bold text-green-600">{stats.accuracy}%</p>
        </div>
      </div>
    </div>
  );
}

function ReinforcementModule({ userId }: { userId: string }) {
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const today = Timestamp.now();
        const hist = query(
          collection(db, 'users', userId, 'history'),
          where('nextReviewDate', '<=', today),
          orderBy('nextReviewDate'),
          limit(10),
        );
        const hsnap = await getDocs(hist);
        if (hsnap.empty) { setReviewQuestions([]); setLoading(false); return; }
        const ids = [...new Set(hsnap.docs.map(d => (d.data() as any).questionId))];
        if (!ids.length) { setReviewQuestions([]); setLoading(false); return; }

        const qsnap = await getDocs(query(collection(db, 'questions'), where('__name__', 'in', ids)));
        setReviewQuestions(qsnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch (e) {
        console.error('讀取複習題失敗', e);
        setReviewQuestions([]);
      } finally { setLoading(false); }
    };
    run();
  }, [userId]);

  if (loading) return <p>正在準備複習題…</p>;
  if (reviewQuestions.length === 0) return <p>今日無待複習題目，繼續加油！</p>;

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">個人化強化複習</h2>
      <div className="space-y-8">
        {reviewQuestions.map((q, i) => <QuestionRenderer key={q.id} questionData={q} number={i + 1} userId={userId} />)}
      </div>
    </div>
  );
}

/* =========================================================================
   7) 管理員後台（含「最近題目（可刪除）」）
   ========================================================================= */
function AdminModule() {
  // 既有：貼題入庫
  const [pastedContent, setPastedContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // 新增：清單 + 篩選 + 刪除
  type LiteQ = { id: string; title?: string; createdAt?: any; correctAnswer?: string; type?: string };
  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<LiteQ[]>([]);
  const [kw, setKw] = useState('');

  const htmlToText = (html?: string) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
    // 可把 <span class="definition/translation"> 一併轉成文字檢索
  };

  const fetchRecent = async () => {
    setListLoading(true);
    try {
      const qy = query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(qy);
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) } as LiteQ)));
    } catch {
      // 舊資料缺 createdAt 的保底
      const snap = await getDocs(collection(db, 'questions'));
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) } as LiteQ)));
    } finally {
      setListLoading(false);
    }
  };
  useEffect(() => { fetchRecent(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此題嗎？刪除後無法復原。')) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
      setItems(prev => prev.filter(x => x.id !== id));
      setMessage('✅ 已刪除 1 題。');
    } catch (err) {
      console.error(err);
      setMessage('❌ 刪除失敗，請稍後再試。');
    }
  };

  // 既有：貼題入庫（保留原解析格式）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const div = document.createElement('div');
      div.innerHTML = pastedContent;
      const plain = div.textContent || '';

      if (!plain.includes('正確答案：')) throw new Error("找不到 '✅ 正確答案：'。");
      if (!plain.includes('詳解：'))     throw new Error("找不到 '📖 詳解：'。");

      const errorParts = pastedContent.split(/🔍/i);
      const mainHtml = errorParts[0];
      const errorHtml = errorParts[1] || '';

      const explanationParts = mainHtml.split(/📖/i);
      const explanation = explanationParts[1]?.replace('詳解：', '').trim() || '';
      const contentBeforeExplanationHtml = explanationParts[0];

      const ans = plain.match(/✅\s*正確答案：\s*([A-Z])/i);
      if (!ans) throw new Error("無法解析正確答案（例：✅ 正確答案：C）。");
      const correctAnswer = ans[1].toUpperCase();

      const contentBeforeAnswerHtml = contentBeforeExplanationHtml.split(/✅/i)[0].trim();
      const firstIdx = contentBeforeAnswerHtml.search(/\(\s*[A-Z]\s*\)/);
      if (firstIdx === -1) throw new Error("找不到任何選項標記（例如 (A)）。");

      const title = contentBeforeAnswerHtml
        .substring(0, firstIdx)
        .replace(/^[0-9]+\.\s*（\s*　?\s*）/, '')
        .trim();

      const optionsBlock = contentBeforeAnswerHtml.substring(firstIdx);
      const options = optionsBlock.split(/\(\s*[A-Z]\s*\)/).slice(1).map(s => s.trim());

      const errorAnalysis: Record<string, string> = {};
      if (errorHtml) {
        errorHtml.replace('錯因分析：', '').trim().split('\n').forEach(line => {
          const [k, v] = line.split(/[:：]/);
          const key = (k || '').trim().toUpperCase();
          if (['A','B','C','D','E'].includes(key) && v) errorAnalysis[key] = v.trim();
        });
      }

      await addDoc(collection(db, 'questions'), {
        type: 'single_choice',
        title,
        options,
        correctAnswer,
        explanation,
        errorAnalysis,
        createdAt: serverTimestamp(),
      });

      setMessage('✅ 成功新增題目！');
      setPastedContent('');
      fetchRecent();
    } catch (err: any) {
      setMessage(`❌ 新增失敗：${err?.message || '未知錯誤'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = items.filter(i =>
    !kw ||
    htmlToText(i.title).includes(kw) ||
    (i.correctAnswer || '').toUpperCase().includes(kw.toUpperCase())
  );

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">管理員後台 - 智慧產生器（單選題）</h2>
      {message && (
        <p className={`p-3 rounded-md ${message.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </p>
      )}

      {/* 貼題入庫 */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
        <textarea
          value={pastedContent}
          onChange={(e) => setPastedContent(e.target.value)}
          rows={18}
          className="w-full p-2 border rounded-md font-mono text-sm"
          placeholder="把完整題目貼在這裡（要含：✅ 正確答案：X、📖 詳解：…、以及 (A)(B)(C)(D) 選項；可含 .definition / .translation）"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded disabled:bg-green-300"
        >
          {isSubmitting ? '處理中…' : '智慧產生並存入資料庫'}
        </button>
      </form>

      {/* 最近題目（可刪除） */}
      <section className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold">最近題目（可刪除）</h3>
          <div className="flex gap-2">
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="關鍵字/答案 篩選…"
              className="border rounded px-2 py-1 text-sm"
            />
            <button onClick={fetchRecent} type="button" className="px-3 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300">
              重新整理列表
            </button>
          </div>
        </div>

        {listLoading ? (
          <p>讀取中…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">目前沒有資料。</p>
        ) : (
          <ul className="divide-y">
            {filtered.map(q => {
              const created =
                q.createdAt?.toDate ? q.createdAt.toDate() :
                (q.createdAt?.seconds ? new Date(q.createdAt.seconds * 1000) : null);
              return (
                <li key={q.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{htmlToText(q.title)}</div>
                    <div className="text-xs text-gray-500">
                      ID：{q.id}　{created ? `建立：${created.toLocaleString()}` : ''}{q.correctAnswer ? `　答案：${q.correctAnswer}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="shrink-0 px-3 py-1.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    刪除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* =========================================================================
   8) App（登入 / 導覽 / 模組切換）
   ========================================================================= */
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'practice' | 'analysis' | 'reinforcement' | 'admin'>('practice');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async cur => {
      if (cur) {
        const adminDoc = await getDoc(doc(db, 'admins', cur.uid));
        setIsAdmin(adminDoc.exists());
        setUser(cur);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('註冊失敗：此 Email 已被註冊。');
      else if (['auth/invalid-credential', 'auth/wrong-password'].includes(err.code)) setError('登入失敗：帳號或密碼錯誤。');
      else setError('發生未知錯誤，請稍後再試。');
    } finally { setIsSubmitting(false); }
  };

  const logout = async () => { await signOut(auth); setPage('practice'); };

  const renderContent = () => {
    if (!user) return null;
    const uid = user.uid as string;
    switch (page) {
      case 'practice':      return <PracticeModule userId={uid} />;
      case 'analysis':      return <AnalysisModule userId={uid} />;
      case 'reinforcement': return <ReinforcementModule userId={uid} />;
      case 'admin':         return isAdmin ? <AdminModule /> : <p>權限不足。</p>;
      default:              return <PracticeModule userId={uid} />;
    }
  };

  if (!app) {
    return (
      <div className="min-h-screen bg-red-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg border-4 border-red-500">
          <h1 className="text-3xl font-bold text-center text-red-700">系統設定錯誤</h1>
          <p className="text-center text-gray-700 mt-4">尚未正確設定 Firebase 金鑰。</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-100"><div className="text-xl font-bold">載入中…</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2">高中國文智慧取分系統</h1>
          <p className="text-center text-gray-500 mb-6">{authMode === 'login' ? '登入您的帳號' : '建立新帳號'}</p>
          <form onSubmit={handleAuth}>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">電子郵件</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                     className="shadow border rounded w-full py-2 px-3 focus:outline-none" required />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">密碼</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                     className="shadow border rounded w-full py-2 px-3 focus:outline-none" required />
            </div>
            {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
            <div className="flex items-center justify-between">
              <button type="submit" disabled={isSubmitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-blue-300">
                {isSubmitting ? '處理中…' : (authMode === 'login' ? '登入' : '註冊')}
              </button>
              <a href="#" onClick={e => { e.preventDefault(); setAuthMode(authMode === 'login' ? 'signup' : 'login'); }}
                 className="text-sm text-blue-600 hover:underline">
                {authMode === 'login' ? '還沒有帳號？註冊' : '已經有帳號？登入'}
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 讓 .definition / .translation 在題目中有顏色 */}
      <style>{`.definition{color:#d9534f} .translation{color:#0275d8} .prose{max-width:65ch}`}</style>

      <div className="flex h-screen bg-gray-100 font-sans">
        <aside className="w-64 bg-white shadow-md flex flex-col flex-shrink-0">
          <div className="p-6 border-b">
            <h1 className="text-2xl font-bold text-gray-800">智慧取分系統</h1>
            <p className="text-sm text-gray-500">龍騰版高中國文</p>
          </div>
          <nav className="flex-1 px-4 py-4">
            <a href="#" onClick={e => { e.preventDefault(); setPage('practice'); }}
               className={`flex items-center gap-2 px-4 py-2 rounded-md hover:bg-gray-200 ${page === 'practice' ? 'bg-gray-200' : ''}`}>
              {icons.book}<span>智慧測驗</span>
            </a>
            <a href="#" onClick={e => { e.preventDefault(); setPage('analysis'); }}
               className={`flex items-center gap-2 px-4 py-2 mt-2 rounded-md hover:bg-gray-200 ${page === 'analysis' ? 'bg-gray-200' : ''}`}>
              {icons.brain}<span>學習分析</span>
            </a>
            <a href="#" onClick={e => { e.preventDefault(); setPage('reinforcement'); }}
               className={`flex items-center gap-2 px-4 py-2 mt-2 rounded-md hover:bg-gray-200 ${page === 'reinforcement' ? 'bg-gray-200' : ''}`}>
              {icons.target}<span>個人化強化複習</span>
            </a>
            {isAdmin && (
              <a href="#" onClick={e => { e.preventDefault(); setPage('admin'); }}
                 className={`flex items-center gap-2 px-4 py-2 mt-5 text-red-700 rounded-md hover:bg-red-100 ${page === 'admin' ? 'bg-red-100' : ''}`}>
                {icons.admin}<span>管理員後台</span>
              </a>
            )}
          </nav>
          <div className="p-4 border-t">
            <div className="flex items-center gap-2">{icons.user}<span className="text-sm font-semibold">{user.email}</span></div>
            <button onClick={logout} className="flex items-center gap-2 w-full px-4 py-2 mt-4 text-sm text-gray-600 rounded-md hover:bg-gray-200">
              {icons.logout}<span>登出</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 lg:p-10 overflow-y-auto">{renderContent()}</main>
      </div>
    </>
  );
}
