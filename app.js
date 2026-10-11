/* =========================================================================
   DoorServe — app.js   (single-page app, hash routes like #/services)
   Firebase v10 modular SDK from the CDN. No build tools.
   Pages: Home, Services, Find (area results), Provider profile, Request a
   service, Join as a provider, Safety, About, Contact, plus Sign in,
   My requests, Review, Inbox/Chat, Settings (notifications) and Admin.
   ========================================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove, writeBatch,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ---------- 1. SETTINGS YOU CAN EDIT ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDniLgUhpYIj9Qy-Hgt-FHLGSyjvl_9zwI",
  authDomain: "doorserve-80377.firebaseapp.com",
  projectId: "doorserve-80377",
  storageBucket: "doorserve-80377.firebasestorage.app",
  messagingSenderId: "853222469085",
  appId: "1:853222469085:web:2d885fee6d4ce59213da34",
  measurementId: "G-P6TTX13G2H"
};
// Shown on the Contact page. Leave "" to hide a line.
const CONTACT = { email: "", phone: "", whatsapp: "" };
const AREAS = ["Srinagar", "Anantnag", "Baramulla", "Budgam", "Pulwama", "Kupwara", "Ganderbal", "Bandipora", "Shopian", "Kulgam"];
const SERVICES = ["Electrician", "Plumber", "Mechanic", "Carpenter", "Appliance repair", "Painter", "Other"];
const PREF_TIMES = ["Today", "Tomorrow", "This week", "Any time"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- 2. HELPERS ---------- */
const $ = (s, r = document) => r.querySelector(s);
const enc = encodeURIComponent;

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === "value") n.value = v;
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
  return n;
}
const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M4 5h16v11H9.5L4 20.5V5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path fill="currentColor" d="M12 4a8 8 0 010 16z"/>'
};
function ic(name) {
  const s = document.createElement("span");
  s.className = "ico";
  s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  return s;
}
const lab = (t, el) => h("label", { class: "field" }, h("span", {}, t), el);
const msg = (t, cls = "") => h("p", { class: ("empty " + cls).trim() }, t);
function select(opts, value = "", placeholder = "") {
  const s = h("select", {}, placeholder ? h("option", { value: "" }, placeholder) : null,
    opts.map((o) => h("option", { value: o }, o)));
  s.value = value;
  return s;
}
function toast(text, type = "info") {
  let box = $("#toasts");
  if (!box) { box = h("div", { id: "toasts", class: "toasts", "aria-live": "polite" }); document.body.append(box); }
  const t = h("div", { class: "toast " + type }, text);
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}
const ERR = {
  "auth/invalid-email": "That email address doesn’t look right.",
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem. Check your connection.",
  "permission-denied": "Not allowed. If this keeps happening, check that the latest Firestore rules are published.",
  "unavailable": "Can’t reach the server. Check your connection."
};
const friendly = (e) => ERR[e && e.code] || "Something went wrong. Please try again.";
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : 0);
function timeAgo(t) {
  const d = t && t.toDate ? t.toDate() : null;
  if (!d) return "just now";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function cleanUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; }
  catch (e) { return null; }
}
const digits = (s) => String(s || "").replace(/\D/g, "");
const intl = (s) => { const d = digits(s); return d.length === 10 ? "91" + d : d.replace(/^0+/, ""); };
const validPhone = (s) => { const n = digits(s).length; return n >= 10 && n <= 13; };
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
async function busy(btn, fn) {
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

/* funnel tracking (no personal data) */
function logEvent(type, detail = "") {
  addDoc(collection(db, "events"), { type, detail: String(detail).slice(0, 100), createdAt: serverTimestamp() }).catch(() => {});
}
function logOnce(type) {
  try { if (sessionStorage.getItem("ev_" + type)) return; sessionStorage.setItem("ev_" + type, "1"); } catch (e) { /* ignore */ }
  logEvent(type);
}

/* ---------- 3. SESSION STATE ---------- */
let me = null, profile = {}, isAdmin = false, unread = 0, ready = false, signingUp = false;
let globalUnsubs = [];
const myName = () => profile.name || (me && me.displayName) || (me && me.email ? me.email.split("@")[0] : "Member");

async function ensureUser(user, name) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const data = {
    name: String(name || user.displayName || (user.email || "").split("@")[0] || "Member").trim().slice(0, 60),
    notifyMessages: true, notifyRequests: true, createdAt: serverTimestamp()
  };
  await setDoc(ref, data);
  return data;
}
async function afterAuth(user, name) {
  me = user;
  try { profile = await ensureUser(user, name); } catch (e) { profile = {}; toast(friendly(e), "error"); }
  try { isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); } catch (e) { isAdmin = false; }
  startGlobal();
  renderNav();
}
onAuthStateChanged(auth, async (user) => {
  if (signingUp) return;
  if (user) await afterAuth(user);
  else { stopGlobal(); me = null; profile = {}; isAdmin = false; unread = 0; renderNav(); }
  ready = true;
  route();
});
function goNext() {
  let n = "#/settings";
  try { n = sessionStorage.getItem("next") || n; sessionStorage.removeItem("next"); } catch (e) { /* ignore */ }
  location.hash = n;
}

/* ---------- 4. NOTIFICATIONS (while the app is open) ---------- */
function notify(title, body, hash) {
  if (document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
    navigator.serviceWorker.ready
      .then((r) => r.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" + hash } }))
      .catch(() => {});
  } else toast(title + ": " + body);
}
function stopGlobal() { globalUnsubs.forEach((u) => u()); globalUnsubs = []; }
function startGlobal() {
  stopGlobal();
  let first1 = true, first2 = true;
  const q1 = query(collection(db, "conversations"), where("participants", "array-contains", me.uid));
  globalUnsubs.push(onSnapshot(q1, (snap) => {
    unread = snap.docs.filter((d) => (d.data().unreadFor || []).includes(me.uid)).length;
    renderNav();
    if (!first1) {
      snap.docChanges().forEach((ch) => {
        if (ch.type === "removed") return;
        const x = ch.doc.data();
        const here = location.hash === "#/chat/" + ch.doc.id && !document.hidden;
        if ((x.unreadFor || []).includes(me.uid) && x.lastSender !== me.uid && profile.notifyMessages !== false && !here) {
          const other = (x.participants || []).find((p) => p !== me.uid);
          notify("New message", ((x.names || {})[other] || "Someone") + ": " + x.lastText, "#/chat/" + ch.doc.id);
        }
      });
    }
    first1 = false;
  }, () => {}));
  const q2 = query(collection(db, "requests"), where("providerOwnerUid", "==", me.uid));
  globalUnsubs.push(onSnapshot(q2, (snap) => {
    if (!first2 && profile.notifyRequests !== false) {
      snap.docChanges().forEach((ch) => {
        if (ch.type === "added") notify("New service request", ch.doc.data().service + " in " + ch.doc.data().area, "#/my");
      });
    }
    first2 = false;
  }, () => {}));
}

/* ---------- 5. NAV + ROUTER ---------- */
function renderNav() {
  $("#topnav").replaceChildren(...[["Services", "#/services", "services"], ["How it works", "#/how", "how"],
    ["Safety", "#/safety", "safety"], ["Join as a provider", "#/join", "join"]]
    .map(([t, hr, r]) => h("a", { href: hr, "data-route": r }, t)));
  const acct = $("#acctLink");
  acct.setAttribute("href", me ? "#/settings" : "#/login");
  acct.setAttribute("data-route", me ? "settings" : "login");
  acct.replaceChildren(ic("user"));
  const items = [["Home", "#/", "home", "home"], ["Services", "#/services", "services", "grid"],
    ["Request", "#/request", "request", "plus"], ["Inbox", "#/inbox", "inbox", "chat"],
    [me ? "Account" : "Sign in", me ? "#/settings" : "#/login", me ? "settings" : "login", "user"]];
  $("#bottomnav").replaceChildren(...items.map(([t, hr, r, i]) =>
    h("a", { href: hr, "data-route": r, class: r === "request" ? "plus" : "" }, ic(i), t,
      r === "inbox" && unread ? h("span", { class: "dot" }, String(unread)) : null)));
  markActive();
}
function markActive() {
  const cur = (location.hash.slice(1).split("?")[0].split("/").filter(Boolean)[0]) || "home";
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

const VIEWS = {};
let ctx = null;
async function route() {
  if (!ready) return;
  if (ctx) { ctx.dead = true; ctx.unsubs.forEach((u) => u()); }
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const root = h("section", { class: "stack" });
  // Make root.append() skip null/false children (used for optional sections).
  root.append = (...k) => Element.prototype.append.apply(root, k.flat().filter((x) => x !== null && x !== undefined && x !== false));
  const c = ctx = {
    root, parts, q: new URLSearchParams(qs || ""), dead: false, unsubs: [],
    own(u) { if (c.dead) u(); else c.unsubs.push(u); }
  };
  $("#view").replaceChildren(root);
  markActive();
  window.scrollTo(0, 0);
  try { await (VIEWS[parts[0] || "home"] || VIEWS.notfound)(c); }
  catch (e) { console.error(e); if (!c.dead) root.replaceChildren(msg(friendly(e), "err")); }
}
window.addEventListener("hashchange", route);

function needLogin(c) {
  if (me) return false;
  try { sessionStorage.setItem("next", location.hash || "#/"); } catch (e) { /* ignore */ }
  c.root.append(h("div", { class: "card stack" }, h("h2", {}, "Please sign in"),
    h("p", { class: "muted" }, "You need an account for this. It takes a minute."),
    h("a", { class: "btn btn-primary", href: "#/login" }, "Sign in or create account")));
  return true;
}

/* ---------- 6. SHARED PIECES ---------- */
let provCache = null, statCache = null;
async function loadProviders() {
  if (provCache && Date.now() - provCache.t < 60000) return provCache.data;
  const s = await getDocs(query(collection(db, "providers"), where("active", "==", true), limit(300)));
  provCache = { t: Date.now(), data: s.docs.map((d) => ({ id: d.id, ...d.data() })) };
  return provCache.data;
}
async function loadStats() {
  if (statCache && Date.now() - statCache.t < 60000) return statCache.data;
  const s = await getDocs(query(collection(db, "reviews"), limit(1000)));
  const m = {};
  s.docs.forEach((d) => { const x = d.data(); const e = m[x.providerId] || (m[x.providerId] = { sum: 0, n: 0 }); e.sum += x.rating; e.n++; });
  statCache = { t: Date.now(), data: m };
  return m;
}
const badge = (p) => (p.verified === true
  ? h("span", { class: "chip ok" }, ic("check"), "Verified")
  : h("span", { class: "chip muted" }, "Not verified yet"));
const avatar = (p, big) => h("span", { class: "avatar" + (big ? " lg" : "") }, (p.name || "?").trim().charAt(0).toUpperCase());
function ratingLine(st) {
  if (!st || !st.n) return h("span", { class: "muted small" }, "No reviews yet");
  const avg = st.sum / st.n;
  return h("span", { class: "small" }, h("span", { class: "stars" }, stars(Math.round(avg))), " " + avg.toFixed(1) + " (" + st.n + ")");
}
function contactBtns(p) {
  const track = (k) => () => logEvent("contact", k + ":" + p.id);
  return h("div", { class: "row" },
    h("a", { class: "btn btn-primary btn-sm", href: "tel:+" + intl(p.phone), on: { click: track("call") } }, ic("phone"), "Call"),
    h("a", { class: "btn btn-wa btn-sm", href: "https://wa.me/" + intl(p.whatsapp || p.phone), target: "_blank", rel: "noopener", on: { click: track("whatsapp") } }, ic("chat"), "WhatsApp"));
}
function providerCard(p, st) {
  return h("article", { class: "card pcard" },
    h("a", { class: "pc-main", href: "#/provider/" + p.id }, avatar(p),
      h("div", {}, h("div", { class: "pc-name" }, p.name, badge(p)),
        h("div", { class: "muted small" }, p.category + " · " + p.area + (p.experienceYears ? " · " + p.experienceYears + " yrs" : "")),
        ratingLine(st))),
    contactBtns(p));
}
function installButton() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const b = h("button", { class: "btn btn-ghost btn-block", type: "button" }, "Install DoorServe app");
  b.hidden = !!standalone;
  b.addEventListener("click", async () => {
    if (window.__bip) { window.__bip.prompt(); try { await window.__bip.userChoice; } catch (e) { /* ignore */ } window.__bip = null; }
    else toast("iPhone: tap Share, then “Add to Home Screen”. Android: browser menu, then “Install app”.");
  });
  return b;
}

/* ---------- 7. PUBLIC PAGES ---------- */
VIEWS.home = async (c) => {
  logOnce("home_view");
  const area = select(AREAS, "", "All areas"), svc = select(SERVICES, "", "Any service");
  const find = () => { location.hash = "#/find?area=" + enc(area.value) + "&service=" + enc(svc.value); };
  c.root.append(
    h("section", { class: "hero" },
      h("h1", {}, "Trusted local help, one tap away."),
      h("p", { class: "lead" }, "Choose your area and a service, then contact a provider directly."),
      h("div", { class: "card finder" }, lab("1 · Area", area), lab("2 · Service", svc),
        h("button", { class: "btn btn-primary btn-block", type: "button", on: { click: find } }, "3 · Find a provider")),
      installButton()),
    h("section", { class: "block" }, h("h2", {}, "Popular services"),
      h("div", { class: "chips" }, SERVICES.slice(0, 6).map((s) => h("a", { class: "chip", href: "#/find?service=" + enc(s) }, s)))),
    h("section", { class: "card teaser" }, h("p", { class: "muted small" }, "Example request"),
      h("p", {}, "“My geyser stopped heating. Need a plumber in Rajbagh today.”"),
      h("a", { class: "btn btn-ghost btn-sm", href: "#/request" }, "Request a service")),
    h("section", { class: "block" }, h("h2", {}, "A badge means we checked"),
      h("p", { class: "muted" }, "Providers show “Verified” only after DoorServe completes its checks. Until then: “Not verified yet”."),
      h("a", { href: "#/safety" }, "How we verify")),
    h("section", { class: "block cta" }, h("h2", {}, "Offer a service?"),
      h("p", { class: "muted" }, "Get found by people in your area. Joining is free."),
      h("a", { class: "btn btn-primary", href: "#/join" }, "Join as a provider")));
};

VIEWS.services = async (c) => {
  c.root.append(h("h1", { class: "page-title" }, "Services"),
    h("div", { class: "tiles" }, SERVICES.map((s) => h("a", { class: "tile", href: "#/find?service=" + enc(s) }, ic("wrench"), s))),
    h("p", { class: "muted small" }, "More categories are coming as providers join."));
};

VIEWS.how = async (c) => {
  c.root.append(h("h1", { class: "page-title" }, "How it works"),
    h("ol", { class: "steps" },
      h("li", {}, h("div", {}, h("h3", {}, "Choose your area"), h("p", { class: "muted" }, "Tell us where you need help."))),
      h("li", {}, h("div", {}, h("h3", {}, "Choose a service"), h("p", { class: "muted" }, "Electrician, plumber, mechanic and more."))),
      h("li", {}, h("div", {}, h("h3", {}, "Contact a provider"), h("p", { class: "muted" }, "Call, WhatsApp, message, or send a service request."))),
      h("li", {}, h("div", {}, h("h3", {}, "Review the job"), h("p", { class: "muted" }, "After a job is marked completed, you can rate the provider.")))),
    h("a", { class: "btn btn-primary", href: "#/" }, "Find a provider"));
};

VIEWS.find = async (c) => {
  const area = select(AREAS, c.q.get("area") || "", "All areas"), svc = select(SERVICES, c.q.get("service") || "", "Any service");
  const list = h("div", { class: "stack" }, msg("Loading providers…")), count = h("p", { class: "muted small" });
  c.root.append(h("h1", { class: "page-title" }, "Find a provider"), h("div", { class: "filters" }, area, svc), count, list);
  const [all, stats] = await Promise.all([loadProviders(), loadStats()]);
  const render = () => {
    const rows = all.filter((p) => (!area.value || p.area === area.value) && (!svc.value || p.category === svc.value))
      .sort((a, b) => (b.verified === true) - (a.verified === true) || a.name.localeCompare(b.name));
    count.textContent = rows.length + (rows.length === 1 ? " provider" : " providers");
    if (!rows.length) {
      list.replaceChildren(h("div", { class: "card stack" }, h("h3", {}, "No providers here yet"),
        h("p", { class: "muted" }, "Send a request and we’ll help find someone."),
        h("a", { class: "btn btn-primary", href: "#/request?area=" + enc(area.value) + "&service=" + enc(svc.value) }, "Request a service")));
    } else list.replaceChildren(...rows.map((p) => providerCard(p, stats[p.id])));
  };
  const change = () => {
    render();
    history.replaceState(null, "", "#/find?area=" + enc(area.value) + "&service=" + enc(svc.value));
    logEvent("search", area.value + "|" + svc.value);
  };
  area.addEventListener("change", change);
  svc.addEventListener("change", change);
  render();
  logEvent("search", area.value + "|" + svc.value);
};

VIEWS.provider = async (c) => {
  const s = await getDoc(doc(db, "providers", c.parts[1] || "x"));
  if (!s.exists() || s.data().active === false) { c.root.append(msg("This provider isn’t available.")); return; }
  const p = { id: s.id, ...s.data() };
  const revs = (await getDocs(query(collection(db, "reviews"), where("providerId", "==", p.id), limit(50)))).docs
    .map((d) => d.data()).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const st = { sum: revs.reduce((a, r) => a + r.rating, 0), n: revs.length };
  const photos = (p.photos || []).map(cleanUrl).filter(Boolean);
  const msgBtn = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, ic("chat"), "Message");
  msgBtn.hidden = !p.ownerUid;
  msgBtn.addEventListener("click", async () => {
    if (!me) { try { sessionStorage.setItem("next", location.hash); } catch (e) { /* ignore */ } location.hash = "#/login"; return; }
    if (p.ownerUid === me.uid) { toast("This is your own profile."); return; }
    await busy(msgBtn, async () => {
      try { await openChat(p.ownerUid, p.name); } catch (e) { toast(friendly(e), "error"); }
    });
  });
  c.root.append(
    h("div", { class: "card stack" },
      h("div", { class: "profile-head" }, avatar(p, true),
        h("div", {}, h("h1", {}, p.name), h("p", { class: "muted" }, p.category + " · " + p.area), badge(p), h("div", {}, ratingLine(st)))),
      h("div", { class: "facts" },
        h("div", { class: "fact" }, h("b", {}, "Experience"), (p.experienceYears || 0) + " years"),
        h("div", { class: "fact" }, h("b", {}, "Working hours"), p.hours || "Ask the provider")),
      p.about ? h("p", {}, p.about) : null,
      contactBtns(p),
      h("div", { class: "row" }, msgBtn, h("a", { class: "btn btn-primary btn-sm", href: "#/request?provider=" + p.id }, "Request a service"))),
    photos.length ? h("div", { class: "card stack" }, h("h2", {}, "Work photos"),
      h("div", { class: "photos" }, photos.map((u) => h("img", { src: u, alt: "Work by " + p.name, loading: "lazy", referrerpolicy: "no-referrer" })))) : null,
    h("div", { class: "card stack" }, h("h2", {}, "Reviews"),
      revs.length ? revs.map((r) => h("div", { class: "review" }, h("span", { class: "stars" }, stars(r.rating)),
        h("b", {}, r.customerName), r.text ? h("p", {}, r.text) : null))
        : h("p", { class: "muted" }, "No reviews yet. Reviews appear only after a completed job.")));
};

VIEWS.request = async (c) => {
  if (needLogin(c)) return;
  const pid = c.q.get("provider") || "";
  let prov = null;
  if (pid) { const s = await getDoc(doc(db, "providers", pid)); if (s.exists()) prov = { id: s.id, ...s.data() }; }
  const name = h("input", { type: "text", maxlength: 60, required: true, value: myName() });
  const phone = h("input", { type: "tel", inputmode: "tel", maxlength: 20, required: true, placeholder: "10-digit mobile number" });
  const area = select(AREAS, prov ? prov.area : c.q.get("area") || "", "Choose area");
  const svc = select(SERVICES, prov ? prov.category : c.q.get("service") || "", "Choose service");
  const desc = h("textarea", { maxlength: 600, required: true, placeholder: "What needs fixing?" });
  const when = select(PREF_TIMES, "Today");
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, "Send request");
  const form = h("form", { class: "card" }, lab("Your name", name), lab("Phone", phone), lab("Area", area), lab("Service", svc),
    lab("Short description", desc), lab("Preferred time", when), err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fail = (t) => { err.textContent = t; err.hidden = false; };
    err.hidden = true;
    if (!validPhone(phone.value)) return fail("Enter a valid phone number.");
    if (!area.value || !svc.value) return fail("Choose an area and a service.");
    if (!desc.value.trim()) return fail("Describe the job in a few words.");
    if (prov && prov.ownerUid === me.uid) return fail("You can’t send a request to your own listing.");
    await busy(btn, async () => {
      try {
        await addDoc(collection(db, "requests"), {
          customerUid: me.uid, customerName: name.value.trim().slice(0, 60), phone: phone.value.trim(),
          area: area.value, service: svc.value, description: desc.value.trim().slice(0, 600), preferredTime: when.value,
          providerId: prov ? prov.id : "", providerName: prov ? prov.name : "", providerOwnerUid: prov ? prov.ownerUid || "" : "",
          status: "new", createdAt: serverTimestamp()
        });
        logEvent("request", prov ? prov.id : "");
        toast("Request sent.", "ok");
        location.hash = "#/my";
      } catch (e2) { fail(friendly(e2)); }
    });
  });
  c.root.append(h("h1", { class: "page-title" }, "Request a service"),
    prov ? h("p", { class: "muted" }, "To: " + prov.name) : h("p", { class: "muted" }, "We’ll match you with a provider."), form);
};

VIEWS.join = async (c) => {
  const adminMode = c.q.get("admin") === "1" && isAdmin;
  const f = {
    name: h("input", { type: "text", maxlength: 80, required: true }),
    cat: select(SERVICES, "", "Choose service"), area: select(AREAS, "", "Choose area"),
    phone: h("input", { type: "tel", inputmode: "tel", maxlength: 20, required: true, placeholder: "10-digit mobile number" }),
    wa: h("input", { type: "tel", inputmode: "tel", maxlength: 20, placeholder: "Leave empty if same as phone" }),
    exp: h("input", { type: "number", min: 0, max: 60, value: "0" }),
    hours: h("input", { type: "text", maxlength: 80, placeholder: "e.g. Mon–Sat, 9am–7pm" }),
    about: h("textarea", { maxlength: 400, placeholder: "What you do, in a few lines" }),
    photos: h("textarea", { placeholder: "Links to work photos, one per line (optional, up to 4)" })
  };
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, adminMode ? "Add provider" : "Send application");
  const form = h("form", { class: "card" }, lab("Name / business name", f.name), lab("Service", f.cat), lab("Service area", f.area),
    lab("Phone (shown publicly)", f.phone), lab("WhatsApp number", f.wa), lab("Experience (years)", f.exp),
    lab("Working hours", f.hours), lab("About", f.about), lab("Work photo links", f.photos), err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fail = (t) => { err.textContent = t; err.hidden = false; };
    err.hidden = true;
    if (!f.cat.value || !f.area.value) return fail("Choose a service and an area.");
    if (!validPhone(f.phone.value)) return fail("Enter a valid phone number.");
    if (f.wa.value.trim() && !validPhone(f.wa.value)) return fail("WhatsApp number looks wrong.");
    const links = f.photos.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4).map(cleanUrl);
    if (links.includes(null)) return fail("Photo links must start with https://");
    const data = {
      name: f.name.value.trim().slice(0, 80), category: f.cat.value, area: f.area.value, phone: f.phone.value.trim(),
      whatsapp: f.wa.value.trim(), experienceYears: Math.max(0, Math.min(60, parseInt(f.exp.value, 10) || 0)),
      hours: f.hours.value.trim().slice(0, 80), about: f.about.value.trim().slice(0, 400), photos: links
    };
    await busy(btn, async () => {
      try {
        if (adminMode) {
          await addDoc(collection(db, "providers"), { ...data, ownerUid: "", verified: false, active: true, createdAt: serverTimestamp() });
          provCache = null; toast("Provider added.", "ok"); location.hash = "#/admin";
        } else {
          await addDoc(collection(db, "providerApplications"), { ...data, applicantUid: me ? me.uid : "", createdAt: serverTimestamp() });
          c.root.replaceChildren(h("div", { class: "card stack" }, h("h2", {}, "Thank you!"),
            h("p", { class: "muted" }, "We received your application. We’ll contact you to verify your details before your profile goes live."),
            h("a", { class: "btn btn-primary", href: "#/" }, "Back to home")));
        }
      } catch (e2) { fail(friendly(e2)); }
    });
  });
  c.root.append(h("h1", { class: "page-title" }, adminMode ? "Add a provider" : "Join as a provider"),
    h("p", { class: "muted" }, adminMode ? "Adds a listing directly (not verified)." : "Free to join. Your phone number is shown on your public profile. Tip: sign in first if you want customers to message you in the app."),
    form);
};

VIEWS.safety = async (c) => {
  c.root.append(h("h1", { class: "page-title" }, "Reviews & Safety"),
    h("div", { class: "card stack" }, h("h2", {}, "What “Verified” means"),
      h("p", {}, "A provider gets the Verified badge only after DoorServe has personally completed these checks:"),
      h("ul", {}, h("li", {}, "We called the phone number on the profile."),
        h("li", {}, "We checked that their name matches an ID."),
        h("li", {}, "We saw examples of their past work.")),
      h("p", { class: "muted" }, "Everyone else shows “Not verified yet”. That is not a warning, only that we haven’t checked yet.")),
    h("div", { class: "card stack" }, h("h2", {}, "Honest reviews"),
      h("p", {}, "You can review a provider only after your request is marked completed, so every review comes from a real job.")),
    h("div", { class: "card stack" }, h("h2", {}, "Staying safe"),
      h("ul", {}, h("li", {}, "Agree the price before work starts."),
        h("li", {}, "Don’t pay in advance for the whole job."),
        h("li", {}, "Prefer verified providers, and check reviews."),
        h("li", {}, "Report problems on the Contact page."))));
};

VIEWS.about = async (c) => {
  c.root.append(h("h1", { class: "page-title" }, "About DoorServe"),
    h("div", { class: "logo-card" }, h("img", { src: "logo.png", alt: "DoorServe — Trusted local services" })),
    h("p", {}, "DoorServe helps people find reliable local services — electricians, plumbers, mechanics, carpenters and more — and helps skilled providers get found."),
    h("p", { class: "muted" }, "We’re starting in Kashmir, one area at a time, and growing only as fast as we can keep trust high."),
    h("a", { class: "btn btn-primary", href: "#/" }, "Find a provider"));
};

VIEWS.contact = async (c) => {
  const f = { name: h("input", { type: "text", maxlength: 60 }), contact: h("input", { type: "text", maxlength: 80, placeholder: "Phone or email" }),
    message: h("textarea", { maxlength: 800, required: true }) };
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, "Send message");
  const form = h("form", { class: "card" }, lab("Your name", f.name), lab("Phone or email", f.contact), lab("Message", f.message), err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!f.message.value.trim()) return;
    await busy(btn, async () => {
      try {
        await addDoc(collection(db, "contactMessages"), { name: f.name.value.trim().slice(0, 60), contact: f.contact.value.trim().slice(0, 80),
          message: f.message.value.trim().slice(0, 800), createdAt: serverTimestamp() });
        form.replaceChildren(h("h2", {}, "Thanks, we got your message."));
      } catch (e2) { err.textContent = friendly(e2); err.hidden = false; }
    });
  });
  c.root.append(h("h1", { class: "page-title" }, "Contact"),
    CONTACT.email ? h("p", {}, "Email: ", h("a", { href: "mailto:" + CONTACT.email }, CONTACT.email)) : null,
    CONTACT.phone ? h("p", {}, "Phone: ", h("a", { href: "tel:" + CONTACT.phone }, CONTACT.phone)) : null,
    CONTACT.whatsapp ? h("p", {}, h("a", { href: "https://wa.me/" + intl(CONTACT.whatsapp), target: "_blank", rel: "noopener" }, "Chat on WhatsApp")) : null,
    form);
};

VIEWS.notfound = async (c) => { c.root.append(msg("Page not found."), h("a", { class: "btn btn-primary", href: "#/" }, "Go home")); };

/* ---------- 8. ACCOUNT ---------- */
VIEWS.login = async (c) => {
  if (me) { goNext(); return; }
  let mode = "in";
  const name = h("input", { type: "text", maxlength: 60, autocomplete: "name" });
  const email = h("input", { type: "email", required: true, autocomplete: "email" });
  const pw = h("input", { type: "password", required: true, autocomplete: "current-password" });
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, "Sign in");
  const nameField = lab("Your name", name);
  nameField.hidden = true;
  const tabIn = h("button", { class: "btn btn-sm btn-primary", type: "button" }, "Sign in");
  const tabUp = h("button", { class: "btn btn-sm btn-ghost", type: "button" }, "Create account");
  const forgot = h("button", { class: "btn btn-sm btn-ghost", type: "button" }, "Forgot password?");
  const setMode = (m) => {
    mode = m; nameField.hidden = m === "in"; btn.textContent = m === "in" ? "Sign in" : "Create account";
    tabIn.className = "btn btn-sm " + (m === "in" ? "btn-primary" : "btn-ghost");
    tabUp.className = "btn btn-sm " + (m === "up" ? "btn-primary" : "btn-ghost");
    pw.setAttribute("autocomplete", m === "in" ? "current-password" : "new-password"); err.hidden = true;
  };
  tabIn.addEventListener("click", () => setMode("in"));
  tabUp.addEventListener("click", () => setMode("up"));
  forgot.addEventListener("click", async () => {
    if (!email.value.trim()) { err.textContent = "Enter your email first."; err.hidden = false; return; }
    try { await sendPasswordResetEmail(auth, email.value.trim()); toast("Password reset email sent.", "ok"); }
    catch (e) { err.textContent = friendly(e); err.hidden = false; }
  });
  const form = h("form", { class: "card" }, h("div", { class: "row" }, tabIn, tabUp), h("div", { style: "height:12px" }),
    nameField, lab("Email", email), lab("Password", pw), err, btn, h("div", { style: "height:8px" }), forgot);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    await busy(btn, async () => {
      try {
        if (mode === "up") {
          const nm = name.value.trim().slice(0, 60);
          if (!nm) { err.textContent = "Please enter your name."; err.hidden = false; return; }
          signingUp = true;
          const cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pw.value);
          try { await updateProfile(cred.user, { displayName: nm }); } catch (e2) { /* non-critical */ }
          await afterAuth(cred.user, nm);
          signingUp = false;
          goNext();
        } else {
          await signInWithEmailAndPassword(auth, email.value.trim(), pw.value);
        }
      } catch (e2) { signingUp = false; err.textContent = friendly(e2); err.hidden = false; }
    });
  });
  c.root.append(h("h1", { class: "page-title" }, "Welcome"), form);
};

VIEWS.settings = async (c) => {
  if (needLogin(c)) return;
  const sw = (label, key) => {
    const cb = h("input", { type: "checkbox" });
    cb.checked = profile[key] !== false;
    cb.addEventListener("change", async () => {
      try { await updateDoc(doc(db, "users", me.uid), { [key]: cb.checked }); profile[key] = cb.checked; }
      catch (e) { cb.checked = !cb.checked; toast(friendly(e), "error"); }
    });
    return h("label", { class: "switch" }, h("span", {}, label), cb);
  };
  const perm = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, "Allow alerts on this device");
  perm.hidden = !("Notification" in window) || Notification.permission === "granted";
  perm.addEventListener("click", async () => {
    const r = await Notification.requestPermission();
    toast(r === "granted" ? "Alerts allowed." : "Alerts are blocked in your browser settings.", r === "granted" ? "ok" : "info");
    perm.hidden = r === "granted";
  });
  const out = h("button", { class: "btn btn-ghost btn-block", type: "button" }, "Sign out");
  out.addEventListener("click", async () => { await signOut(auth); location.hash = "#/"; });
  c.root.append(h("h1", { class: "page-title" }, "Account"),
    h("div", { class: "card stack" }, h("h2", {}, myName()), h("p", { class: "muted small" }, me.email)),
    h("div", { class: "card stack" }, h("h2", {}, "Notifications"), sw("New messages", "notifyMessages"), sw("New service requests (providers)", "notifyRequests"),
      perm, h("p", { class: "muted small" }, "Alerts reach you while DoorServe is open or in the background. Alerts when the app is fully closed need a paid server plan and aren’t on yet.")),
    h("a", { class: "btn btn-ghost btn-block", href: "#/my" }, "My requests"),
    installButton(),
    isAdmin ? h("a", { class: "btn btn-primary btn-block", href: "#/admin" }, "Admin") : null,
    out);
};

/* ---------- 9. REQUESTS + REVIEWS ---------- */
const STATUS = { new: "Received", contacted: "Provider contacted", completed: "Completed", cancelled: "Cancelled" };
VIEWS.my = async (c) => {
  if (needLogin(c)) return;
  const mine = h("div", { class: "stack" }, msg("Loading…")), inc = h("div", { class: "stack" });
  const incTitle = h("h2", {}, "Requests for you");
  incTitle.hidden = true;
  c.root.append(h("h1", { class: "page-title" }, "My requests"), mine, incTitle, inc);
  const reviewed = new Set((await getDocs(query(collection(db, "reviews"), where("customerUid", "==", me.uid)))).docs.map((d) => d.id));
  const sorted = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  c.own(onSnapshot(query(collection(db, "requests"), where("customerUid", "==", me.uid)), (snap) => {
    const rows = sorted(snap);
    mine.replaceChildren(...(rows.length ? rows.map((r) => h("article", { class: "card stack" },
      h("div", { class: "row" }, h("b", {}, r.service + " · " + r.area), h("span", { class: "status " + r.status }, STATUS[r.status] || r.status)),
      h("p", {}, r.description),
      h("p", { class: "muted small" }, (r.providerName ? "Provider: " + r.providerName : "We’ll match you with a provider") + " · " + r.preferredTime),
      r.status === "completed" ? (reviewed.has(r.id) ? h("p", { class: "muted small" }, "Thanks for your review.")
        : h("a", { class: "btn btn-primary btn-sm", href: "#/review/" + r.id }, "Leave a review")) : null))
      : [h("div", { class: "card stack" }, h("p", { class: "muted" }, "No requests yet."), h("a", { class: "btn btn-primary btn-sm", href: "#/request" }, "Request a service"))]));
  }, (e) => toast(friendly(e), "error")));
  c.own(onSnapshot(query(collection(db, "requests"), where("providerOwnerUid", "==", me.uid)), (snap) => {
    const rows = sorted(snap);
    incTitle.hidden = !rows.length;
    inc.replaceChildren(...rows.map((r) => {
      const set = (status) => updateDoc(doc(db, "requests", r.id), { status }).catch((e) => toast(friendly(e), "error"));
      return h("article", { class: "card stack" },
        h("div", { class: "row" }, h("b", {}, r.service + " · " + r.area), h("span", { class: "status " + r.status }, STATUS[r.status] || r.status)),
        h("p", {}, r.description), h("p", { class: "muted small" }, r.customerName + " · " + r.preferredTime),
        h("div", { class: "row" }, h("a", { class: "btn btn-primary btn-sm", href: "tel:+" + intl(r.phone) }, ic("phone"), "Call"),
          r.status === "new" ? h("button", { class: "btn btn-ghost btn-sm", type: "button", on: { click: () => set("contacted") } }, "Mark contacted") : null,
          r.status !== "completed" && r.status !== "cancelled" ? h("button", { class: "btn btn-ghost btn-sm", type: "button", on: { click: () => set("completed") } }, "Mark completed") : null));
    }));
  }, () => {}));
};

VIEWS.review = async (c) => {
  if (needLogin(c)) return;
  const rid = c.parts[1] || "x";
  const s = await getDoc(doc(db, "requests", rid));
  if (!s.exists() || s.data().customerUid !== me.uid || s.data().status !== "completed" || !s.data().providerId) {
    c.root.append(msg("You can review a provider only after your request is marked completed.")); return;
  }
  const r = s.data();
  let rating = 0;
  const btns = [1, 2, 3, 4, 5].map((n) => h("button", { type: "button", "aria-label": n + " star" + (n > 1 ? "s" : ""), on: { click: () => { rating = n; btns.forEach((b, i) => b.classList.toggle("on", i < n)); } } }, "★"));
  const text = h("textarea", { maxlength: 500, placeholder: "How did it go? (optional)" });
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, "Submit review");
  const form = h("form", { class: "card" }, h("div", { class: "rate" }, btns), h("div", { style: "height:10px" }), lab("Your review", text), err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!rating) { err.textContent = "Tap a star rating first."; err.hidden = false; return; }
    await busy(btn, async () => {
      try {
        await setDoc(doc(db, "reviews", rid), { providerId: r.providerId, customerUid: me.uid, customerName: myName().slice(0, 60),
          rating, text: text.value.trim().slice(0, 500), createdAt: serverTimestamp() });
        statCache = null; toast("Review posted. Thank you!", "ok"); location.hash = "#/provider/" + r.providerId;
      } catch (e2) { err.textContent = friendly(e2); err.hidden = false; }
    });
  });
  c.root.append(h("h1", { class: "page-title" }, "Review " + r.providerName), form);
};

/* ---------- 10. MESSAGES ---------- */
async function openChat(otherUid, otherName) {
  const cid = [me.uid, otherUid].sort().join("_");
  const ref = doc(db, "conversations", cid);
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, { participants: [me.uid, otherUid], names: { [me.uid]: myName(), [otherUid]: otherName || "Provider" },
      lastText: "", lastSender: "", unreadFor: [], updatedAt: serverTimestamp() });
  }
  location.hash = "#/chat/" + cid;
}
VIEWS.inbox = async (c) => {
  if (needLogin(c)) return;
  const list = h("div", { class: "stack" }, msg("Loading…"));
  c.root.append(h("h1", { class: "page-title" }, "Messages"), list);
  c.own(onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", me.uid)), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).filter((x) => x.lastText)
      .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
    list.replaceChildren(...(rows.length ? rows.map((x) => {
      const other = x.participants.find((p) => p !== me.uid);
      const nm = (x.names || {})[other] || "Member";
      return h("a", { class: "card convo", href: "#/chat/" + x.id }, avatar({ name: nm }),
        h("div", {}, h("b", {}, nm), h("div", { class: "muted small last" }, x.lastText)),
        (x.unreadFor || []).includes(me.uid) ? h("span", { class: "dot", style: "position:static" }, "1") : null);
    }) : [msg("No messages yet. Open a provider’s profile and tap Message.")]));
  }, (e) => toast(friendly(e), "error")));
};
VIEWS.chat = async (c) => {
  if (needLogin(c)) return;
  const cid = c.parts[1] || "x";
  const ref = doc(db, "conversations", cid);
  const box = h("div", { class: "chatbox" });
  const input = h("input", { type: "text", maxlength: 1000, placeholder: "Write a message…", "aria-label": "Message", autocomplete: "off" });
  const send = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Send");
  const title = h("h1", { class: "page-title" }, "Chat");
  let other = "";
  c.root.append(h("p", {}, h("a", { href: "#/inbox" }, "← Messages")), title, box, h("form", { class: "sendbar" }, input, send));
  c.root.lastChild.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !other) return;
    input.value = "";
    try {
      const b = writeBatch(db);
      b.set(doc(collection(db, "conversations", cid, "messages")), { senderUid: me.uid, text, createdAt: serverTimestamp() });
      b.update(ref, { lastText: text.slice(0, 120), lastSender: me.uid, unreadFor: [other], updatedAt: serverTimestamp() });
      await b.commit();
    } catch (e2) { input.value = text; toast(friendly(e2), "error"); }
  });
  c.own(onSnapshot(ref, (s) => {
    if (!s.exists()) { box.replaceChildren(msg("Conversation not found.")); return; }
    const x = s.data();
    other = x.participants.find((p) => p !== me.uid) || "";
    title.textContent = (x.names || {})[other] || "Chat";
    if ((x.unreadFor || []).includes(me.uid)) updateDoc(ref, { unreadFor: arrayRemove(me.uid) }).catch(() => {});
  }, (e) => toast(friendly(e), "error")));
  c.own(onSnapshot(query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "asc"), limit(200)), (snap) => {
    box.replaceChildren(...snap.docs.map((d) => {
      const m = d.data({ serverTimestamps: "estimate" });
      return h("div", { class: "bubble" + (m.senderUid === me.uid ? " mine" : "") }, m.text);
    }));
    box.scrollTop = box.scrollHeight;
  }, (e) => toast(friendly(e), "error")));
};

/* ---------- 11. ADMIN ---------- */
VIEWS.admin = async (c) => {
  if (needLogin(c)) return;
  if (!isAdmin) { c.root.append(msg("This area is for DoorServe admins only.")); return; }
  const count = async (q) => (await getCountFromServer(q)).data().count;
  const ev = (t) => count(query(collection(db, "events"), where("type", "==", t)));
  const [v, s, ct, rq, done] = await Promise.all([ev("home_view"), ev("search"), ev("contact"), ev("request"),
    count(query(collection(db, "requests"), where("status", "==", "completed")))]);
  const fn = (n, t) => h("div", {}, h("b", {}, String(n)), h("span", {}, t));
  const apps = h("div", { class: "stack" }), provs = h("div", { class: "stack" }), reqs = h("div", { class: "stack" }), msgs = h("div", { class: "stack" });
  const sec = (t, el, open) => h("details", { class: "card", open: open || null }, h("summary", {}, t), h("div", { style: "height:10px" }), el);
  c.root.append(h("h1", { class: "page-title" }, "Admin"),
    h("div", { class: "card stack" }, h("h2", {}, "Funnel"), h("div", { class: "funnel" }, fn(v, "Visitors"), fn(s, "Searches"), fn(ct, "Contacts"), fn(rq, "Requests"), fn(done, "Completed"))),
    sec("Applications", apps, true), sec("Providers", provs), sec("Requests", reqs, true), sec("Contact messages", msgs));
  const err = (e) => toast(friendly(e), "error");
  let providerList = [];
  c.own(onSnapshot(collection(db, "providerApplications"), (snap) => {
    apps.replaceChildren(...(snap.empty ? [msg("No new applications.")] : snap.docs.map((d) => {
      const a = d.data();
      const approve = async () => {
        const b = writeBatch(db);
        b.set(doc(collection(db, "providers")), { name: a.name, category: a.category, area: a.area, phone: a.phone, whatsapp: a.whatsapp,
          experienceYears: a.experienceYears, hours: a.hours, about: a.about, photos: a.photos || [], ownerUid: a.applicantUid || "",
          verified: false, active: true, createdAt: serverTimestamp() });
        b.delete(d.ref);
        await b.commit(); provCache = null; toast("Approved. Now verify them when you’ve checked.", "ok");
      };
      return h("div", { class: "stack" }, h("b", {}, a.name + " · " + a.category + " · " + a.area),
        h("p", { class: "muted small" }, a.phone + " · " + a.experienceYears + " yrs · " + a.hours), a.about ? h("p", {}, a.about) : null,
        h("div", { class: "row" }, h("button", { class: "btn btn-primary btn-sm", type: "button", on: { click: () => approve().catch(err) } }, "Approve"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", on: { click: () => deleteDoc(d.ref).catch(err) } }, "Reject")));
    })));
  }, err));
  c.own(onSnapshot(collection(db, "providers"), (snap) => {
    providerList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    provs.replaceChildren(h("a", { class: "btn btn-ghost btn-sm", href: "#/join?admin=1" }, "Add provider directly"),
      ...providerList.map((p) => h("div", { class: "stack" }, h("b", {}, p.name + " · " + p.category + " · " + p.area),
        h("div", { class: "row" }, badge(p), p.active === false ? h("span", { class: "chip muted" }, "Hidden") : null),
        h("div", { class: "row" },
          h("button", { class: "btn btn-primary btn-sm", type: "button", on: { click: () => updateDoc(doc(db, "providers", p.id), { verified: p.verified !== true }).then(() => { provCache = null; }).catch(err) } }, p.verified === true ? "Remove badge" : "Mark verified"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", on: { click: () => updateDoc(doc(db, "providers", p.id), { active: p.active === false }).then(() => { provCache = null; }).catch(err) } }, p.active === false ? "Show" : "Hide")))));
  }, err));
  c.own(onSnapshot(query(collection(db, "requests"), limit(100)), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    reqs.replaceChildren(...(rows.length ? rows.map((r) => {
      const pick = h("select", {}, h("option", { value: "" }, "— provider —"), providerList.map((p) => h("option", { value: p.id }, p.name + " (" + p.area + ")")));
      pick.value = r.providerId || "";
      const st = h("select", {}, Object.keys(STATUS).map((k) => h("option", { value: k }, STATUS[k])));
      st.value = r.status;
      const save = h("button", { class: "btn btn-primary btn-sm", type: "button" }, "Save");
      save.addEventListener("click", () => busy(save, async () => {
        const p = providerList.find((x) => x.id === pick.value);
        const upd = { status: st.value };
        if (p) { upd.providerId = p.id; upd.providerName = p.name; upd.providerOwnerUid = p.ownerUid || ""; }
        try { await updateDoc(doc(db, "requests", r.id), upd); toast("Saved.", "ok"); } catch (e) { err(e); }
      }));
      return h("div", { class: "stack" }, h("b", {}, r.service + " · " + r.area + " · " + (STATUS[r.status] || r.status)), h("p", {}, r.description),
        h("p", { class: "muted small" }, r.customerName + " · " + r.phone + " · " + r.preferredTime),
        h("div", { class: "filters" }, pick, st), save);
    }) : [msg("No requests yet.")]));
  }, err));
  c.own(onSnapshot(query(collection(db, "contactMessages"), limit(50)), (snap) => {
    msgs.replaceChildren(...(snap.empty ? [msg("No messages.")] : snap.docs.map((d) => { const m = d.data();
      return h("div", { class: "stack" }, h("b", {}, (m.name || "Anonymous") + " · " + m.contact), h("p", {}, m.message),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", on: { click: () => deleteDoc(d.ref).catch(err) } }, "Delete")); })));
  }, err));
};

/* ---------- 12. START ---------- */
(function init() {
  const btn = $("#themeToggle");
  btn.replaceChildren(ic("contrast"));
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ds-theme", next); } catch (e) { /* ignore */ }
  });
  renderNav();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
