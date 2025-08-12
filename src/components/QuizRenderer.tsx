import { useState } from 'react';
import type { QAItem, ChoiceKey } from '../types/qa';

type Props = { data: QAItem[] };

export default function QuizRenderer({ data }: Props) {
  const [answers, setAnswers] = useState<Record<string, ChoiceKey | null>>({});

  const handleChange = (qid: string, key: ChoiceKey) => {
    setAnswers(prev => ({ ...prev, [qid]: key }));
  };

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-8">
      {data.map(q => {
        const selected = answers[q.id] ?? null;
        const isCorrect = selected ? selected === q.answer : null;

        return (
          <div key={q.id} className="rounded-2xl border bg-white/70 shadow-sm p-5">
            <div className="prose max-w-none mb-4" dangerouslySetInnerHTML={{ __html: q.stem_html }} />
            <div className="space-y-3">
              {q.options.map(opt => {
                const name = `q-${q.id}`;
                const checked = selected === opt.key;
                const pickedWrong = checked && opt.key !== q.answer;
                const pickedRight = checked && opt.key === q.answer;

                return (
                  <label
                    key={opt.key}
                    className={`flex gap-3 items-start rounded-xl border p-3 cursor-pointer hover:bg-slate-50 transition
                    ${pickedRight ? 'border-emerald-500' : ''} ${pickedWrong ? 'border-rose-400' : ''}`}>
                    <input
                      type="radio"
                      name={name}
                      className="mt-1"
                      checked={checked || false}
                      onChange={() => handleChange(q.id, opt.key)}
                    />
                    <div className="flex-1">
                      <div dangerouslySetInnerHTML={{ __html: `${opt.key}. ${opt.text_html}` }} />
                      {opt.translation ? <div className="translation">{opt.translation}</div> : null}
                      {selected === opt.key && q.rationales?.[opt.key] ? (
                        <div className="mt-1 text-sm">{q.rationales[opt.key]}</div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            {selected ? (
              <div className={`mt-4 rounded-xl p-3 border ${isCorrect ? 'border-emerald-500' : 'border-slate-300'}`}>
                <div className="font-medium">{isCorrect ? '✅ 作答正確' : `❌ 正確答案：${q.answer}`}</div>
                {q.explanation ? <div className="mt-1 text-slate-600">{q.explanation}</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
