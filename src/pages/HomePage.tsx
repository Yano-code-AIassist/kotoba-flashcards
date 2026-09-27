import { ArrowRight, BookOpen, Plus, Sparkles, Sprout } from 'lucide-react';
import type { AppData, Deck } from '../types/domain';
import { calculateProgress } from '../utils/progress';
import { DeckCard } from '../components/deck/DeckCard';
import { OverviewStats } from '../components/deck/ProgressSummary';

interface HomePageProps {
  data: AppData;
  onCreate: () => void;
  onRename: (deck: Deck) => void;
  onDelete: (deck: Deck) => void;
}

export function HomePage({ data, onCreate, onRename, onDelete }: HomePageProps) {
  const progress = calculateProgress(data.words);
  return (
    <>
      <section className="welcome-panel" aria-labelledby="home-heading">
        <div className="welcome-copy">
          <p className="eyebrow">
            <span />
            YOUR LEARNING SPACE
          </p>
          <h1 id="home-heading">
            ひとつずつ、
            <br className="mobile-break" />
            「わかる」を増やそう。
          </h1>
          <p className="welcome-description">
            覚えたいことを、あなたの単語帳に。
            <br className="mobile-break" />
            小さな一歩からはじめましょう。
          </p>
          <span className="welcome-tag">
            <Sprout size={15} />
            自分のペースで、着実に。
          </span>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-dot dot-one" />
          <div className="art-dot dot-two" />
          <div className="art-card card-back" />
          <div className="art-card card-front">
            <span className="art-card-tag">TODAY'S LITTLE STEP</span>
            <BookOpen size={38} strokeWidth={1.35} />
            <div className="art-line" />
            <div className="art-line short" />
            <span className="art-card-bottom">ことばを、じぶんのものに。</span>
          </div>
          <div className="art-spark">
            <Sparkles size={22} strokeWidth={1.5} />
          </div>
        </div>
      </section>
      <OverviewStats deckCount={data.decks.length} progress={progress} />
      <section className="decks-section" aria-labelledby="decks-heading">
        <div className="section-heading">
          <div>
            <div className="flex items-center gap-3">
              <h2 id="decks-heading">マイ単語帳</h2>
              <span className="count-badge">{data.decks.length}</span>
            </div>
            <p>学びたいことを、テーマごとに。</p>
          </div>
          <button className="button button-primary create-button" onClick={onCreate}>
            <Plus size={18} />
            <span>単語帳を作成</span>
          </button>
        </div>
        {data.decks.length === 0 ? (
          <div className="empty-decks">
            <div className="empty-illustration" aria-hidden="true">
              <div className="empty-book-back" />
              <div className="empty-book">
                <BookOpen size={35} strokeWidth={1.5} />
              </div>
              <span className="empty-plus">
                <Plus size={16} />
              </span>
            </div>
            <h3>最初の単語帳をつくろう</h3>
            <p>
              資格の勉強も、新しい言語も。
              <br />
              あなたの「覚えたい」を、ここから。
            </p>
            <button className="button button-primary" onClick={onCreate}>
              <Plus size={18} />
              最初の単語帳を作成
              <ArrowRight size={17} />
            </button>
            <span className="empty-footnote">名前は、あとから変更できます。</span>
          </div>
        ) : (
          <div className="deck-grid">
            {data.decks.map((deck, index) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                index={index}
                progress={calculateProgress(data.words.filter((word) => word.deckId === deck.id))}
                onRename={() => onRename(deck)}
                onDelete={() => onDelete(deck)}
              />
            ))}
            <button className="new-deck-tile" onClick={onCreate}>
              <span>
                <Plus size={24} />
              </span>
              <strong>新しい単語帳</strong>
              <p>次に学びたいことは？</p>
            </button>
          </div>
        )}
      </section>
    </>
  );
}
