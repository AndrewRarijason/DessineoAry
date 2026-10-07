import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { serverNow } from '../lib/clock';
import { audio } from '../lib/audio';
import type { Guess, RoomState } from '../lib/types';

interface Props {
  state: RoomState;
  /** null si le joueur peut répondre, sinon la raison affichée à la place du champ */
  disabledReason: string | null;
  onSubmitted: () => void;
}

interface LocalNote {
  id: string;
  roundId: string;
  text: string;
  at: number;
}

type Item = { at: number; key: string; guess: Guess } | { at: number; key: string; note: LocalNote };

export function GuessPanel({ state, disabledReason, onSubmitted }: Props) {
  const round = state.round;
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Propositions du serveur + réponses « presque » locales, dans l'ordre chronologique
  const items: Item[] = [
    ...state.guesses.map((g) => ({ at: Date.parse(g.created_at), key: `g${g.id}`, guess: g })),
    ...notes.filter((n) => n.roundId === round?.id).map((n) => ({ at: n.at, key: n.id, note: n })),
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(id);
  }, [flash]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || !round || disabledReason) return;
    setText('');
    inputRef.current?.focus();
    try {
      const result = await api.submitGuess(round.id, value);
      if (result === 'close') {
        setNotes((list) => [...list.slice(-20), { id: `${Date.now()}-${Math.random()}`, roundId: round.id, text: value, at: serverNow() }]);
        setFlash('🔥 Presque !');
        audio.play('close');
      } else if (result === 'correct') {
        setFlash('🎉 Bravo, vous avez trouvé !');
      } else if (result === 'wrong') {
        audio.play('wrong');
      }
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Erreur');
    } finally {
      onSubmitted();
    }
  };

  return (
    <div className="guess-panel">
      <ul className="guess-list" ref={listRef} aria-live="polite">
        {items.length === 0 && <li className="muted guess-empty">Les propositions apparaîtront ici.</li>}
        {items.map((item) =>
          'note' in item ? (
            <li key={item.key} className="guess close">
              <em>« {item.note.text} »</em> : presque ! (visible par vous seul)
            </li>
          ) : item.guess.is_correct ? (
            <li key={item.key} className="guess correct">
              🎉 <strong>{item.guess.nickname}</strong> a trouvé le mot !
            </li>
          ) : (
            <li key={item.key} className="guess">
              <strong>{item.guess.nickname}</strong> {item.guess.content}
            </li>
          ),
        )}
      </ul>

      {flash && <div className="flash">{flash}</div>}

      {disabledReason ? (
        <p className="guess-disabled">{disabledReason}</p>
      ) : (
        <form className="guess-form" onSubmit={submit}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Votre réponse…"
            maxLength={60}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="Votre réponse"
          />
          <button className="btn btn-primary" type="submit">
            Envoyer
          </button>
        </form>
      )}
    </div>
  );
}
