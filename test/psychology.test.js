'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_QUESTIONS, analyze, publicQuestions } = require('../lib/psychology');

test('questionnaire contains the 28 questions from the supplied form and seven items per dimension', () => {
  assert.equal(DEFAULT_QUESTIONS.length, 28);
  const counts = Object.fromEntries(['EI', 'SN', 'TF', 'JP'].map((axis) => [axis, DEFAULT_QUESTIONS.filter((q) => q.axis === axis).length]));
  assert.deepEqual(counts, { EI: 7, SN: 7, TF: 7, JP: 7 });
});

test('answer mapping preserves the reverse-coded items in questions 15, 23, and 25', () => {
  const result = analyze(Object.fromEntries(DEFAULT_QUESTIONS.map((q) => [q.id, 'a'])));
  assert.equal(result.counts.I, 1); // Question 25, option A, maps to I.
  assert.equal(result.counts.T, 2); // Questions 15 and 23, option A, map to T.
  assert.equal(result.counts.J, 7);
  assert.equal(result.code, 'ENFJ');
});

test('small margins are reported as mild preferences rather than certainty', () => {
  const leftByAxis = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };
  const answers = {};
  for (const axis of Object.keys(leftByAxis)) {
    const questions = DEFAULT_QUESTIONS.filter((q) => q.axis === axis);
    questions.forEach((q, index) => {
      const want = index < 4 ? leftByAxis[axis] : (axis === 'EI' ? 'I' : axis === 'SN' ? 'N' : axis === 'TF' ? 'F' : 'P');
      answers[q.id] = q.map.a === want ? 'a' : 'b';
    });
  }
  const result = analyze(answers);
  assert.deepEqual(result.dimensions.map((dimension) => dimension.preference), ['E', 'S', 'T', 'J']);
  assert.ok(result.dimensions.every((dimension) => dimension.difference === 1 && dimension.level === 'ملایم'));
  assert.equal(result.code, 'ESTJ');
  assert.ok(result.profile);
});

test('incomplete answers are rejected and public questions never expose scoring keys', () => {
  assert.throws(() => analyze({ 1: 'a' }), /پاسخ سؤال/);
  const questions = publicQuestions();
  assert.equal(questions.length, 28);
  assert.equal('map' in questions[0], false);
  assert.equal('axis' in questions[0], false);
  assert.equal(questions[0].options.a, DEFAULT_QUESTIONS[0].a);
});

test('question text and option edits do not change the scoring map', () => {
  const overrides = [{ id: 1, text: 'متن تازه', a: 'گزینه یک', b: 'گزینه دو' }];
  const result = analyze(Object.fromEntries(DEFAULT_QUESTIONS.map((q) => [q.id, q.id === 1 ? 'a' : 'b'])), overrides);
  assert.equal(result.totalQuestions, 28);
  assert.ok(result.counts.E > 0);
});
