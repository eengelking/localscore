import { useEffect, useMemo, useState } from "react";
import { getCatalog, getEnvironment, saveAnswers } from "../api.js";
import { Icon } from "../components/Icon.js";
import { QuestionHelpModal } from "../components/QuestionHelpModal.js";
import type { Answer, Catalog, EnvironmentDetail } from "../types.js";

const SKIP_OPTION_ID = "skip";

export function InterviewPage({ environmentId, onDone }: { environmentId: number; onDone: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => setHelpOpen(false), [index]);

  useEffect(() => {
    Promise.all([getCatalog(), getEnvironment(environmentId)])
      .then(([catalogRes, envRes]) => {
        setCatalog(catalogRes);
        setEnvironment(envRes);
        const initial: Record<string, string> = {};
        for (const a of envRes.answers) initial[a.questionId] = a.optionId;
        setAnswers(initial);
      })
      .catch((err: Error) => setError(err.message));
  }, [environmentId]);

  const questions = useMemo(() => [...(catalog?.questions ?? [])].sort((a, b) => a.order - b.order), [catalog]);
  const question = questions[index];
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  async function choose(optionId: string) {
    if (!question) return;
    const next = { ...answers, [question.id]: optionId };
    setAnswers(next);
    setSaving(true);
    setError(null);
    try {
      const toSave: Answer[] = [{ questionId: question.id, optionId }];
      await saveAnswers(environmentId, toSave);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that answer");
    } finally {
      setSaving(false);
    }
  }

  if (error && !catalog) {
    return <p className="error-text">{error}</p>;
  }

  if (!catalog || !environment || !question) {
    return <p>Loading…</p>;
  }

  const isLast = index === questions.length - 1;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <button type="button" className="link-button" onClick={onDone}>
            ← Back to environment
          </button>
          <h1>{environment.name}</h1>
          <p>{question.whyWeAsk ? "Answer a few plain-English questions about this location." : ""}</p>
        </div>
      </div>

      <div className="interview-progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            className={`progress-tick ${answers[q.id] ? "is-answered" : ""} ${i === index ? "is-current" : ""}`}
            aria-label={`Question ${i + 1}: ${q.question}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
      <p className="interview-step-label">
        Question {index + 1} of {questions.length}
        {saving && <span className="saving-indicator"> · saving…</span>}
      </p>

      <div className="card interview-question">
        <div className="interview-question-title">
          <h2>{question.question}</h2>
          <button
            type="button"
            className="icon-button icon-button-quiet"
            aria-label="Why we ask this question"
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="question" />
          </button>
        </div>

        <div className="option-list">
          {question.options
            .filter((o) => o.id !== SKIP_OPTION_ID)
            .map((option) => (
              <button
                key={option.id}
                type="button"
                className={`option-card ${answers[question.id] === option.id ? "is-selected" : ""}`}
                onClick={() => choose(option.id)}
              >
                <span className="option-label">{option.label}</span>
                {option.description && <span className="option-description">{option.description}</span>}
              </button>
            ))}
          <button
            type="button"
            className={`option-card option-card-skip ${answers[question.id] === SKIP_OPTION_ID ? "is-selected" : ""}`}
            onClick={() => choose(SKIP_OPTION_ID)}
          >
            <span className="option-label">Skip: not sure / doesn't apply</span>
          </button>
        </div>
      </div>

      <div className="interview-nav">
        <button type="button" className="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          Back
        </button>
        {isLast ? (
          <button type="button" className="button button-primary" onClick={onDone}>
            Done
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={() => setIndex((i) => i + 1)}>
            Next
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {helpOpen && (
        <QuestionHelpModal
          question={question.question}
          whyWeAsk={question.whyWeAsk}
          helpDetail={question.helpDetail}
          finePrint={question.finePrint}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
