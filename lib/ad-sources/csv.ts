/**
 * CSV を行・セルに分ける。引用符で囲んだセルの中のカンマ・改行・二重の引用符（""）を扱う。
 * 中身が空の行は飛ばす。引用符が閉じていなければ失敗する（途中で切れたファイルを黙って読まない）。
 */
export function readCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") endRow();
    else if (c !== "\r") cell += c;
  }

  if (quoted) throw new Error("CSV の引用符が閉じていません");
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}
