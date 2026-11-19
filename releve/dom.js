/* Relevé de visite — construire le DOM sans jamais interpréter du HTML :
   tout texte entre par textContent (ce que tape un client ou le métreur,
   ou ce qu'a rendu l'IA, n'est jamais lu comme du HTML). Partagé par la
   page du relevé (app.js) et la page du dossier partagé (partage.js). */
export function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}
