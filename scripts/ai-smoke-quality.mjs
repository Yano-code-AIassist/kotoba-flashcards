function normalize(value) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function evidenceFromNote(note) {
  const marker = '資料内の根拠（AI抽出）：';
  const line = note.split(/\r?\n/).find((item) => item.trim().startsWith(marker));
  return line?.trim().slice(marker.length).trim() ?? '';
}

export function evaluateAiSmoke(words, sourceText, expectedConcepts, requestedCount) {
  const checks = [];
  checks.push({
    name: '指定数',
    ok: words.length === requestedCount,
    detail: `${words.length}/${requestedCount}語`,
  });
  const complete = words.every(
    (word) => word.question.trim() && word.answer.trim() && word.note.trim(),
  );
  checks.push({
    name: '必須項目',
    ok: complete,
    detail: complete ? '全候補に問題・答え・補足あり' : '空欄あり',
  });

  const unique = new Set(
    words.map((word) => `${normalize(word.question)}\0${normalize(word.answer)}`),
  );
  checks.push({
    name: '重複なし',
    ok: unique.size === words.length,
    detail: `${unique.size}/${words.length}組が固有`,
  });

  const source = normalize(sourceText);
  const evidence = words.map((word) => evidenceFromNote(word.note));
  const grounded = evidence.every((quote) => quote && source.includes(normalize(quote)));
  checks.push({
    name: '引用根拠',
    ok: grounded,
    detail: grounded ? '全候補の引用が元文章に存在' : '元文章にない、または空の引用あり',
  });

  const generated = normalize(
    words.map((word) => `${word.question} ${word.answer} ${word.note}`).join(' '),
  );
  const missingConcepts = expectedConcepts.filter(
    (concept) => !generated.includes(normalize(concept)),
  );
  checks.push({
    name: '重要語の網羅',
    ok: missingConcepts.length === 0,
    detail: missingConcepts.length ? `不足: ${missingConcepts.join('、')}` : '5つの重要語を確認',
  });

  return { passed: checks.every((check) => check.ok), checks };
}
