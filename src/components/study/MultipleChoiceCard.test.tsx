import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { storedDataFixture } from '../../test/storedDataFixture';
import { MultipleChoiceCard } from './MultipleChoiceCard';

describe('MultipleChoiceCard', () => {
  it('問題と重複しない4つの選択肢を表示し、未選択では次へ進めない', () => {
    const data = storedDataFixture();
    const words = data.words.map((word, index) => ({ ...word, answer: `答え${index + 1}` }));
    words.push({ ...words[0], id: 'word-4', answer: '答え4' });

    const html = renderToStaticMarkup(
      <MultipleChoiceCard
        word={words[0]}
        poolWords={words}
        busy={false}
        blocked={false}
        isLast={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain('問題1');
    expect(html).toContain('正しい答えを1つ選んでください');
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).toContain('次の問題へ');
    expect(html).toContain('disabled=""');
  });
});
