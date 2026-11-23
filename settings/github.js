'use strict';
// 設定ページから GitHub のリポジトリへ、いくつかのファイルを 1 回のコミットで書き込む（Git Data API）
//  トークン（Fine-grained token。対象のリポジトリの Contents: Read and write）は api.github.com にだけ送る
window.SLGitHub = (function () {
  const API = 'https://api.github.com';

  // 文字列（UTF-8）と base64 の変換
  function b64FromBytes(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function textFromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function call(token, method, path, body) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      const err = new Error('GitHub とつながりません');
      err.status = 0;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.message) || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // opt = { token, repo: 'owner/name', branch, message,
  //         files: [{ path, text } | { path, base64 }],
  //         edits: [{ path, apply(currentText) => newText }],   … いまの中身を読んで書き換えるファイル
  //         onStep(text) }
  // 返り値: { sha, url, unchanged }
  async function commit(opt) {
    const { token, repo, branch, message } = opt;
    const step = (t) => { if (opt.onStep) opt.onStep(t); };
    const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
    step('いまの状態を確かめています');
    const ref = await call(token, 'GET', '/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(branch));
    const headSha = ref.object.sha;
    const head = await call(token, 'GET', '/repos/' + repo + '/git/commits/' + headSha);
    const tree = [];
    for (const e of opt.edits || []) {
      const cur = await call(token, 'GET', '/repos/' + repo + '/contents/' + enc(e.path) + '?ref=' + headSha);
      tree.push({ path: e.path, mode: '100644', type: 'blob', content: e.apply(textFromB64(cur.content)) });
    }
    const images = (opt.files || []).filter((f) => f.base64 !== undefined);
    let n = 0;
    for (const f of opt.files || []) {
      if (f.base64 !== undefined) {
        n++;
        step('絵を送っています（' + n + ' / ' + images.length + '）');
        const blob = await call(token, 'POST', '/repos/' + repo + '/git/blobs', { content: f.base64, encoding: 'base64' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      } else {
        tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.text });
      }
    }
    step('コミットを作っています');
    const newTree = await call(token, 'POST', '/repos/' + repo + '/git/trees', { base_tree: head.tree.sha, tree });
    if (newTree.sha === head.tree.sha) return { sha: headSha, url: head.html_url, unchanged: true };
    const c = await call(token, 'POST', '/repos/' + repo + '/git/commits', { message, tree: newTree.sha, parents: [headSha] });
    step('公開ゲームのブランチを進めています');
    await call(token, 'PATCH', '/repos/' + repo + '/git/refs/heads/' + encodeURIComponent(branch), { sha: c.sha, force: false });
    return { sha: c.sha, url: c.html_url, unchanged: false };
  }

  return { commit, textFromB64, b64FromBytes };
})();
