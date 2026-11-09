// 쉼표로 잇는 메타 줄 도우미 (ui/dom.js). 가운데 점 대신 쉼표를 쓰면서 줄바꿈 단위를 항목으로 지킨다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nw, joinMeta } from '../../app/js/ui/dom.js';

const text = (html) => html.replace(/<[^>]+>/g, '');

test('joinMeta: 쉼표는 앞 항목 끝에 붙고, 마지막 항목에는 붙지 않는다', () => {
  assert.equal(joinMeta(['진행 중', '60분', '일반']),
    `${nw('진행 중,')} ${nw('60분,')} ${nw('일반')}`);
  assert.equal(text(joinMeta(['진행 중', '60분', '일반'])), '진행 중, 60분, 일반');
});

test('joinMeta: 배열 항목은 덩어리마다 감싸고 쉼표는 그 항목의 마지막 덩어리에만 붙는다', () => {
  const html = joinMeta([['시간과 강도는', '시작할 때 고릅니다'], '2026-09-28 기록']);
  assert.equal(html, `${nw('시간과 강도는')} ${nw('시작할 때 고릅니다,')} ${nw('2026-09-28 기록')}`);
});

test('joinMeta: 항목 하나이면 쉼표가 없고, 빈 목록은 빈 문자열', () => {
  assert.equal(text(joinMeta(['근육통 없음'])), '근육통 없음');
  assert.equal(joinMeta([]), '');
});

test('joinMeta: 항목 글자를 이스케이프하고, 가운데 점으로 잇지 않는다', () => {
  const html = joinMeta(['<b>x</b>', 'a & b']);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;,') && html.includes('a &amp; b'));
  assert.equal(joinMeta(['가', '나', '다']).includes(String.fromCharCode(0xB7)), false);
});
