// 사업자 정보 (전자상거래법 표시 사항, 2026-11-21): 사업자등록 뒤 아래 값을 채우면 모든 페이지 아래쪽(data-biz 칸)에 나타난다.
// 이름(name)이 비어 있으면 아무것도 보이지 않는다. 통신판매업 신고가 면제면 mailOrder에 "면제(간이과세자)"처럼 적는다.
window.KGV_BIZ = {
  name: "",        // 상호
  owner: "",       // 대표자
  regNo: "",       // 사업자등록번호 (000-00-00000)
  mailOrder: "",   // 통신판매업 신고번호 또는 면제
  address: "",     // 사업장 주소
  contact: "",     // 연락처 (이메일·전화)
};
(function () {
  const b = window.KGV_BIZ;
  if (!b.name) return;
  const items = [["상호", b.name], ["대표", b.owner], ["사업자등록번호", b.regNo], ["통신판매업 신고", b.mailOrder], ["주소", b.address], ["연락처", b.contact]]
    .filter(([, v]) => v);
  const render = () => document.querySelectorAll("[data-biz]").forEach((el) => {
    el.replaceChildren(...items.flatMap(([k, v], i) => {
      const label = document.createElement("span"); label.className = "biz-k"; label.textContent = k;   // 이름표는 번역됨, 값은 그대로
      const val = document.createElement("span"); val.textContent = v;
      return [...(i ? [document.createTextNode("  ·  ")] : []), label, document.createTextNode(" "), val];
    }));
    el.hidden = false;
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
})();
