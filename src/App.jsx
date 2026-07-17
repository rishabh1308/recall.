import React, { useRef, useState } from 'react';

const starterNotes = `Photosynthesis is how plants convert light energy into chemical energy. It occurs mainly in chloroplasts. Carbon dioxide and water are converted into glucose and oxygen using light energy. Chlorophyll absorbs most strongly in red and blue wavelengths. The light-dependent reactions make ATP and NADPH; the Calvin cycle uses them to fix carbon dioxide into sugar.`;

function validateStudySet(value) {
  if (
    !value ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.flashcards) ||
    !Array.isArray(value.quiz)
  ) {
    throw new Error('The response has the wrong shape.');
  }

  if (!value.flashcards.length || !value.quiz.length) {
    throw new Error('The response contains no study material.');
  }

  value.flashcards.forEach((card) => {
    if (
      typeof card.heading !== 'string' ||
      !Array.isArray(card.points) ||
      card.points.length < 2 ||
      card.points.length > 4 ||
      !card.points.every((point) => typeof point === 'string')
    ) {
      throw new Error('A revision card is invalid.');
    }
  });

  value.quiz.forEach((question) => {
    if (
      typeof question.question !== 'string' ||
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3 ||
      typeof question.explanation !== 'string'
    ) {
      throw new Error('A quiz question is invalid.');
    }
  });

  return value;
}

export default function App() {
  const [notes, setNotes] = useState(starterNotes);
  const [studySet, setStudySet] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('cards');
  const [cardIndex, setCardIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const requestId = useRef(0);

  async function generate() {
    if (notes.trim().length < 20) {
      setError('Add a little more detail (at least 20 characters).');
      return;
    }

    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError('');

    try {
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      const body = await response.json();

      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error || 'Something went wrong.');

      const parsed = validateStudySet(JSON.parse(body.raw));
      setStudySet(parsed);
      setCardIndex(0);
      setAnswers({});
      setTab('cards');
      setStatus('success');
    } catch (err) {
      if (currentRequest === requestId.current) {
        setStatus('error');
        setError(
          err instanceof SyntaxError
            ? 'The AI returned malformed JSON. Please retry.'
            : err.message
        );
      }
    }
  }

  function chooseAnswer(questionIndex, optionIndex) {
    setAnswers((old) => ({ ...old, [questionIndex]: optionIndex }));
  }

  function retryWrong() {
    const wrong = studySet.quiz.filter(
      (question, index) => answers[index] !== question.correctIndex
    );

    setStudySet((old) => ({ ...old, quiz: wrong }));
    setAnswers({});
  }

  const answered = studySet ? Object.keys(answers).length : 0;
  const wrongCount = studySet
    ? studySet.quiz.filter(
        (question, index) =>
          answers[index] !== undefined && answers[index] !== question.correctIndex
      ).length
    : 0;
  const complete = studySet && answered === studySet.quiz.length;

  return (
    <main className="app-shell">
      <header>
        <a className="brand" href="#top">
          recall<span>.</span>
        </a>
        <p>Make your notes stick.</p>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">AI STUDY ASSISTANT</p>
          <h1>Turn any topic into a study session.</h1>
          <p className="lede">
            Generate clear flashcards and a self-check quiz from your own notes.
          </p>
        </div>
      </section>

      <section className="composer" aria-label="Create study set">
        <label htmlFor="notes">Your notes or topic</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Paste class notes, a reading summary, or a topic..."
        />
        <div className="composer-footer">
          <span>{notes.length} characters</span>
          <button onClick={generate} disabled={status === 'loading'}>
            {status === 'loading' ? 'Creating your set…' : 'Generate study set →'}
          </button>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={generate}>Try again</button>
          </div>
        )}
      </section>

      {status === 'loading' && (
        <section className="loading">
          <div className="spinner" />
          <p>Reading your notes and writing questions…</p>
          <small>Large 50-question study sets can take a few minutes.</small>
        </section>
      )}

      {studySet && status !== 'loading' && (
        <section className="study-area">
          <div className="set-heading">
            <div>
              <p className="eyebrow">YOUR STUDY SET</p>
              <h2>{studySet.title}</h2>
            </div>
            <span>
              {studySet.flashcards.length} revision cards · {studySet.quiz.length} questions
            </span>
          </div>

          <nav className="tabs" aria-label="Study mode">
            <button
              className={tab === 'cards' ? 'active' : ''}
              onClick={() => setTab('cards')}
            >
              Quick revision
            </button>
            <button
              className={tab === 'quiz' ? 'active' : ''}
              onClick={() => setTab('quiz')}
            >
              Quiz
            </button>
          </nav>

          {tab === 'cards' ? (
            <Flashcards
              cards={studySet.flashcards}
              cardIndex={cardIndex}
              setCardIndex={setCardIndex}
            />
          ) : (
            <Quiz
              quiz={studySet.quiz}
              answers={answers}
              chooseAnswer={chooseAnswer}
              complete={complete}
              wrongCount={wrongCount}
              retryWrong={retryWrong}
            />
          )}
        </section>
      )}

      {status === 'idle' && (
        <section className="empty">
          <span>✦</span>
          <h2>Your study set will appear here.</h2>
          <p>Start with the sample notes above, or replace them with your own.</p>
        </section>
      )}
    </main>
  );
}

function Flashcards({ cards, cardIndex, setCardIndex }) {
  const card = cards[cardIndex];

  function move(amount) {
    setCardIndex((index) => (index + amount + cards.length) % cards.length);
  }

  return (
    <div className="card-study">
      <article className="flashcard">
        <span className="card-label">QUICK REVISION</span>
        <strong>{card.heading}</strong>
        <ul>
          {card.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </article>

      <div className="card-controls">
        <button onClick={() => move(-1)}>← Previous</button>
        <span>
          {cardIndex + 1} / {cards.length}
        </span>
        <button onClick={() => move(1)}>Next →</button>
      </div>
    </div>
  );
}

function Quiz({ quiz, answers, chooseAnswer, complete, wrongCount, retryWrong }) {
  const score = quiz.filter(
    (question, index) => answers[index] === question.correctIndex
  ).length;

  return (
    <div className="quiz">
      {quiz.map((question, questionIndex) => (
        <article className="question" key={questionIndex}>
          <p>
            <b>{questionIndex + 1}.</b> {question.question}
          </p>

          <div className="options">
            {question.options.map((option, optionIndex) => {
              const selected = answers[questionIndex] === optionIndex;
              const answered = answers[questionIndex] !== undefined;
              const state =
                answered && optionIndex === question.correctIndex
                  ? 'correct'
                  : selected
                    ? 'incorrect'
                    : '';

              return (
                <button
                  key={optionIndex}
                  disabled={answered}
                  className={state}
                  onClick={() => chooseAnswer(questionIndex, optionIndex)}
                >
                  <span>{String.fromCharCode(65 + optionIndex)}</span>
                  {option}
                </button>
              );
            })}
          </div>

          {answers[questionIndex] !== undefined && (
            <p className="explanation">{question.explanation}</p>
          )}
        </article>
      ))}

      {complete && (
        <aside className="results">
          <p>Score</p>
          <h3>
            {score} / {quiz.length}
          </h3>
          <span>
            {wrongCount
              ? `${wrongCount} answer${wrongCount > 1 ? 's' : ''} to revisit.`
              : 'Perfect score — excellent work.'}
          </span>
          {wrongCount > 0 && (
            <button onClick={retryWrong}>Re-test wrong answers</button>
          )}
        </aside>
      )}
    </div>
  );
}
