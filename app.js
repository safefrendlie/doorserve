/* =========================================================================
   DoorServe — app.js
   One module shared by index.html, feed.html and profile.html.
   Firebase modular SDK v10 loaded from Google's CDN (no build tools).
   Each page sets <body data-page="home|feed|profile"> to pick its init code.
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* -------------------------------------------------------------------------
   1. FIREBASE CONFIG  ← paste YOUR values here
   Firebase console → Project settings → Your apps → Web app → SDK setup.
   (These keys are safe to be public; your Firestore rules protect the data.)
   ------------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyDniLgUhpYIj9Qy-Hgt-FHLGSyjvl_9zwI",
  authDomain: "doorserve-80377.firebaseapp.com",
  projectId: "doorserve-80377",
  storageBucket: "doorserve-80377.firebasestorage.app",
  messagingSenderId: "853222469085",
  appId: "1:853222469085:web:2d885fee6d4ce59213da34",
  measurementId: "G-P6TTX13G2H"
};

const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");
let auth = null;
let db = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

/* -------------------------------------------------------------------------
   2. SMALL HELPERS
   ------------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element safely. Strings become text nodes, never HTML. */
function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (val === null || val === undefined || val === false) continue;
    if (key === "class") node.className = val;
    else if (key === "text") node.textContent = val;
    else node.setAttribute(key, val === true ? "" : String(val));
  }
  for (const kid of kids.flat()) {
    if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  }
  return node;
}

/* Static, hard-coded SVG strings only (never user data). */
const ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.4 8.3 3.1 5 6.3 5c1.9 0 3.3 1 3.7 2.2h4C14.4 6 15.8 5 17.7 5c3.2 0 4.9 3.3 3.7 6.2-1.9 4.7-9.4 9.3-9.4 9.3z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9.5L4 20.5V5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path data-fill d="M12 4a8 8 0 010 16z"/></svg>'
};
function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = ICONS[name] || "";
  return span;
}

function toast(message, type = "info") {
  let box = $("#toasts");
  if (!box) {
    box = h("div", { id: "toasts", class: "toasts", "aria-live": "polite" });
    document.body.append(box);
  }
  const t = h("div", { class: "toast " + type, text: message });
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

/** Turn Firebase errors into plain-language messages. */
function friendlyError(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/invalid-email": "That email address doesn’t look right.",
    "auth/missing-password": "Enter your password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-closed-by-user": "The Google window was closed before sign-in finished.",
    "auth/cancelled-popup-request": "The Google window was closed before sign-in finished.",
    "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
    "auth/unauthorized-domain": "This website’s domain isn’t authorised in Firebase yet (Authentication → Settings → Authorized domains).",
    "auth/operation-not-allowed": "This sign-in method isn’t enabled in Firebase yet (Authentication → Sign-in method).",
    "permission-denied": "You don’t have permission to do that. Check that the Firestore rules are published.",
    "unavailable": "Can’t reach the server right now. Check your connection.",
    "failed-precondition": "The database isn’t ready for this request. Check your Firestore setup."
  };
  return map[code] || "Something went wrong. Please try again.";
}

function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}

function timeAgo(date) {
  if (!date) return "just now";
  const s = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = s / 60;
  if (m < 60) return Math.max(1, Math.floor(m)) + "m ago";
  const hrs = m / 60;
  if (hrs < 24) return Math.floor(hrs) + "h ago";
  const days = hrs / 24;
  if (days < 7) return Math.floor(days) + "d ago";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: sameYear ? undefined : "numeric"
  });
}

/** "" → empty, null → invalid, string → safe http(s) URL. */
function cleanUrl(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

function makeAvatar(name, url, size = "") {
  const wrap = h("span", { class: ("avatar " + size).trim() });
  const initial = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
  const fallback = () => wrap.replaceChildren(document.createTextNode(initial));
  const safe = cleanUrl(url);
  if (safe) {
    const img = h("img", { src: safe, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("error", fallback);
    wrap.append(img);
  } else {
    fallback();
  }
  return wrap;
}

function showFatal(message) {
  const bar = h("div", { class: "fatal", role: "alert" },
    h("strong", { text: "Setup needed: " }), document.createTextNode(message));
  document.body.prepend(bar);
}

/* -------------------------------------------------------------------------
   3. THEME (light / dark)
   The inline script in each page's <head> sets the first value.
   ------------------------------------------------------------------------- */
function initTheme() {
  const btn = $("#themeToggle");
  if (!btn) return;
  btn.replaceChildren(icon("contrast"));
  btn.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("ds-theme", next); } catch (e) { /* storage blocked */ }
  });
}

/* -------------------------------------------------------------------------
   4. USER DOCUMENT + SESSION STATE
   ------------------------------------------------------------------------- */
let me = null;          // Firebase Auth user
let meProfile = null;   // users/{uid} data for the signed-in user

/** Create users/{uid} the first time someone signs in. */
async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const emailName = user.email ? user.email.split("@")[0] : "";
  const data = {
    uid: user.uid,
    displayName: String(extra.displayName || user.displayName || emailName || "New member").trim().slice(0, 60),
    bio: "",
    role: extra.role === "provider" ? "provider" : "user",
    photoURL: user.photoURL || "",
    bannerUrl: "",
    verified: false, // only an admin can change this (Firebase console)
    createdAt: serverTimestamp()
  };
  await setDoc(ref, data);
  return data;
}

/** Runs `start` once for a signed-in user; sends visitors to the landing page otherwise. */
let started = false;
function guard(start) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { location.replace("index.html"); return; }
    if (started) return;
    started = true;
    me = user;
    try {
      meProfile = await ensureUserDoc(user);
    } catch (err) {
      toast(friendlyError(err), "error");
      meProfile = { displayName: user.displayName || "Member", photoURL: user.photoURL || "", role: "user" };
    }
    setupNavbar();
    start();
  });
}

function setupNavbar() {
  const slot = $("#navAvatarLink");
  if (slot) {
    slot.replaceChildren(makeAvatar(meProfile.displayName || me.displayName, meProfile.photoURL || me.photoURL, "avatar-sm"));
  }
  const out = $("#signOutBtn");
  if (out) {
    out.addEventListener("click", async () => {
      try {
        await signOut(auth);
        location.href = "index.html";
      } catch (err) {
        toast(friendlyError(err), "error");
      }
    });
  }
}

/* -------------------------------------------------------------------------
   5. LANDING PAGE — authentication dialog
   ------------------------------------------------------------------------- */
let authBusy = false; // stops the observer redirecting mid sign-up

function initHome() {
  const dlg = $("#authDialog");
  const form = $("#authForm");
  const errBox = $("#authError");
  const submitBtn = $("#authSubmit");
  const googleBtn = $("#googleBtn");
  const forgotBtn = $("#forgotBtn");
  let mode = "signin";

  const showErr = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
  const setBusy = (busy) => {
    authBusy = busy;
    [submitBtn, googleBtn, forgotBtn].forEach((b) => { b.disabled = busy; });
  };

  function setMode(next) {
    mode = next;
    const signup = next === "signup";
    $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("#tabSignin").setAttribute("aria-selected", String(!signup));
    $("#tabSignup").setAttribute("aria-selected", String(signup));
    $$(".signup-only", form).forEach((el) => { el.hidden = !signup; });
    $("#authName").required = signup;
    const pw = $("#authPassword");
    pw.autocomplete = signup ? "new-password" : "current-password";
    if (signup) pw.setAttribute("minlength", "6"); else pw.removeAttribute("minlength");
    submitBtn.textContent = signup ? "Create account" : "Sign in";
    forgotBtn.hidden = signup;
    showErr("");
  }

  function openAuth(next) {
    setMode(next);
    if (!dlg.open) dlg.showModal();
  }

  $$("[data-open-auth]").forEach((btn) => {
    btn.addEventListener("click", () => openAuth(btn.dataset.openAuth));
  });
  $("#tabSignin").addEventListener("click", () => setMode("signin"));
  $("#tabSignup").addEventListener("click", () => setMode("signup"));
  $("#closeAuth").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    setBusy(true);
    try {
      if (mode === "signup") {
        const name = $("#authName").value.trim().slice(0, 60);
        const role = $("#authRole").value;
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await updateProfile(cred.user, { displayName: name });
          await ensureUserDoc(cred.user, { displayName: name, role });
        } catch (profileErr) {
          // Account exists; the feed page retries creating the profile document.
          console.warn("Profile setup deferred:", profileErr);
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      location.href = "feed.html";
    } catch (err) {
      showErr(friendlyError(err));
      setBusy(false);
    }
  });

  googleBtn.addEventListener("click", async () => {
    showErr("");
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      try { await ensureUserDoc(cred.user); } catch (profileErr) { console.warn("Profile setup deferred:", profileErr); }
      location.href = "feed.html";
    } catch (err) {
      showErr(friendlyError(err));
      setBusy(false);
    }
  });

  forgotBtn.addEventListener("click", async () => {
    const email = $("#authEmail").value.trim();
    if (!email) { showErr("Enter your email above, then select “Forgot password?”."); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showErr("");
      toast("Password reset email sent. Check your inbox.", "ok");
    } catch (err) {
      showErr(friendlyError(err));
    }
  });

  // Already signed in? Skip the landing page.
  onAuthStateChanged(auth, (user) => {
    if (user && !authBusy) location.replace("feed.html");
  });
}

/* -------------------------------------------------------------------------
   6. POST CARDS (shared by feed + profile)
   ------------------------------------------------------------------------- */

/** Keeps the DOM in sync with a list of Firestore docs without rebuilding
    cards (so open comment boxes and typed text survive live updates). */
function reconcileList(container, docs) {
  const cards = container._cards || (container._cards = new Map());
  const keep = new Set();
  docs.forEach((d, i) => {
    keep.add(d.id);
    const data = d.data({ serverTimestamps: "estimate" });
    let card = cards.get(d.id);
    if (!card) {
      card = buildPostCard(d.id, data);
      cards.set(d.id, card);
    }
    updatePostCard(card, data);
    if (container.children[i] !== card) container.insertBefore(card, container.children[i] || null);
  });
  for (const [id, card] of cards) {
    if (!keep.has(id)) {
      if (card._cleanup) card._cleanup();
      card.remove();
      cards.delete(id);
    }
  }
}

function buildPostCard(id, data) {
  const isOwner = !!me && data.uid === me.uid;
  const profileHref = "profile.html?uid=" + encodeURIComponent(data.uid || "");
  const authorName = data.authorName || "Member";

  const timeEl = h("span", { class: "muted small" });
  const delBtn = isOwner
    ? h("button", { class: "icon-btn danger", type: "button", "aria-label": "Delete post" }, icon("trash"))
    : null;

  const head = h("header", { class: "post-head" },
    h("a", { class: "avatar-link", href: profileHref, "aria-label": authorName + "’s profile" },
      makeAvatar(authorName, data.authorPhoto)),
    h("div", { class: "post-meta" },
      h("a", { class: "author", href: profileHref, text: authorName }),
      timeEl),
    delBtn);

  const textEl = data.text ? h("p", { class: "post-text", text: data.text }) : null;

  let imgEl = null;
  const safeImg = cleanUrl(data.imageUrl);
  if (safeImg) {
    imgEl = h("img", {
      class: "post-img", src: safeImg, alt: "Image shared in this post",
      loading: "lazy", referrerpolicy: "no-referrer"
    });
    imgEl.addEventListener("error", () => {
      imgEl.replaceWith(h("p", { class: "img-fail muted small", text: "This image couldn’t be loaded." }));
    });
  }

  const likeCount = h("span", { class: "count", text: "0" });
  const likeBtn = h("button", { class: "action like-btn", type: "button", "aria-pressed": "false" },
    icon("heart"), likeCount);
  const commentCount = h("span", { class: "count", text: "0" });
  const commentBtn = h("button", {
    class: "action", type: "button", "aria-expanded": "false", "aria-label": "Comments"
  }, icon("comment"), commentCount);
  const actions = h("div", { class: "post-actions" }, likeBtn, commentBtn);

  const cList = h("ul", { class: "comment-list" });
  const cInput = h("input", {
    type: "text", maxlength: "500", placeholder: "Write a comment…",
    "aria-label": "Write a comment", autocomplete: "off"
  });
  const cSend = h("button", { class: "btn btn-primary btn-sm", type: "submit", text: "Reply" });
  const cForm = h("form", { class: "comment-form" }, cInput, cSend);
  const cSection = h("section", { class: "comments", hidden: true }, cList, cForm);

  const card = h("article", { class: "post card" }, head, textEl, imgEl, actions, cSection);
  card._ds = { id, data, timeEl, likeBtn, likeCount, commentBtn, commentCount };

  // --- Like / unlike (arrayUnion / arrayRemove keeps it race-safe)
  likeBtn.addEventListener("click", () => {
    const liked = (card._ds.data.likes || []).includes(me.uid);
    updateDoc(doc(db, "posts", id), { likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) })
      .catch((err) => toast(friendlyError(err), "error"));
  });

  // --- Delete own post
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      if (!window.confirm("Delete this post? This can’t be undone.")) return;
      try { await deleteDoc(doc(db, "posts", id)); }
      catch (err) { toast(friendlyError(err), "error"); }
    });
  }

  // --- Comments: live listener only while the section is open
  const stopComments = () => {
    if (card._unsubComments) { card._unsubComments(); card._unsubComments = null; }
    cList.replaceChildren();
  };
  card._cleanup = stopComments;

  commentBtn.addEventListener("click", () => {
    const opening = cSection.hidden;
    cSection.hidden = !opening;
    commentBtn.setAttribute("aria-expanded", String(opening));
    if (opening) {
      const q = query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"), limit(100));
      card._unsubComments = onSnapshot(q, (snap) => {
        if (snap.empty) {
          cList.replaceChildren(h("li", { class: "empty-comment muted small", text: "No comments yet. Start the conversation." }));
        } else {
          cList.replaceChildren(...snap.docs.map((d) => buildComment(id, d)));
        }
      }, (err) => toast(friendlyError(err), "error"));
      cInput.focus();
    } else {
      stopComments();
    }
  });

  cForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = cInput.value.trim();
    if (!text) return;
    cSend.disabled = true;
    try {
      const batch = writeBatch(db);
      const cRef = doc(collection(db, "posts", id, "comments"));
      batch.set(cRef, {
        uid: me.uid,
        authorName: String(meProfile.displayName || me.displayName || "Member").slice(0, 60),
        authorPhoto: meProfile.photoURL || "",
        text: text.slice(0, 500),
        createdAt: serverTimestamp()
      });
      batch.update(doc(db, "posts", id), { commentCount: increment(1) });
      await batch.commit();
      cInput.value = "";
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      cSend.disabled = false;
    }
  });

  return card;
}

function updatePostCard(card, data) {
  const ds = card._ds;
  ds.data = data;
  const likes = Array.isArray(data.likes) ? data.likes : [];
  const liked = !!me && likes.includes(me.uid);
  ds.likeBtn.classList.toggle("liked", liked);
  ds.likeBtn.setAttribute("aria-pressed", String(liked));
  ds.likeBtn.setAttribute("aria-label", (liked ? "Unlike" : "Like") + " (" + likes.length + ")");
  ds.likeCount.textContent = String(likes.length);
  const cc = Number(data.commentCount) || 0;
  ds.commentCount.textContent = String(cc);
  ds.commentBtn.setAttribute("aria-label", "Comments (" + cc + ")");
  ds.timeEl.textContent = timeAgo(toDate(data.createdAt));
}

function buildComment(postId, d) {
  const c = d.data({ serverTimestamps: "estimate" });
  const mine = !!me && c.uid === me.uid;
  const name = c.authorName || "Member";
  const href = "profile.html?uid=" + encodeURIComponent(c.uid || "");
  const delBtn = mine
    ? h("button", { class: "icon-btn danger", type: "button", "aria-label": "Delete comment" }, icon("trash"))
    : null;
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "posts", postId, "comments", d.id));
        batch.update(doc(db, "posts", postId), { commentCount: increment(-1) });
        await batch.commit();
      } catch (err) {
        toast(friendlyError(err), "error");
      }
    });
  }
  return h("li", { class: "comment" },
    makeAvatar(name, c.authorPhoto, "avatar-sm"),
    h("div", { class: "comment-body" },
      h("div", { class: "comment-head" },
        h("a", { class: "author", href, text: name }),
        h("span", { class: "muted small", text: timeAgo(toDate(c.createdAt)) })),
      h("p", { text: c.text || "" })),
    delBtn);
}

/* -------------------------------------------------------------------------
   7. FEED PAGE
   ------------------------------------------------------------------------- */
function initFeed() {
  const list = $("#feed");
  const status = $("#feedStatus");
  const form = $("#composer");
  const textarea = $("#postText");
  const imageRow = $("#imageRow");
  const imageInput = $("#postImage");
  const counter = $("#charCount");
  const postBtn = $("#postBtn");
  const errBox = $("#composerError");
  const setErr = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };

  $("#toggleImage").addEventListener("click", () => {
    imageRow.hidden = !imageRow.hidden;
    if (!imageRow.hidden) imageInput.focus();
  });
  textarea.addEventListener("input", () => {
    counter.textContent = textarea.value.length + " / 1000";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("");
    const text = textarea.value.trim();
    const imageUrl = cleanUrl(imageInput.value);
    if (imageUrl === null) { setErr("That image link doesn’t look right. Use a full link starting with https://"); return; }
    if (!text && !imageUrl) { setErr("Write something or add an image link first."); return; }
    if (text.length > 1000 || imageUrl.length > 2000) { setErr("That post is too long."); return; }

    postBtn.disabled = true;
    postBtn.textContent = "Posting…";
    try {
      await addDoc(collection(db, "posts"), {
        uid: me.uid,
        authorName: String(meProfile.displayName || me.displayName || "Member").slice(0, 60),
        authorPhoto: meProfile.photoURL || "",
        text,
        imageUrl,
        likes: [],
        commentCount: 0,
        createdAt: serverTimestamp()
      });
      textarea.value = "";
      imageInput.value = "";
      imageRow.hidden = true;
      counter.textContent = "0 / 1000";
    } catch (err) {
      setErr(friendlyError(err));
    } finally {
      postBtn.disabled = false;
      postBtn.textContent = "Post";
    }
  });

  // Real-time feed, newest first (single-field order → no composite index needed)
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(q, (snap) => {
    reconcileList(list, snap.docs);
    status.classList.remove("error");
    status.hidden = !snap.empty;
    if (snap.empty) status.textContent = "No posts yet. Ask for help or share your work to get things started.";
  }, (err) => {
    status.hidden = false;
    status.classList.add("error");
    status.textContent = friendlyError(err);
  });
}

/* -------------------------------------------------------------------------
   8. PROFILE PAGE
   ------------------------------------------------------------------------- */
function initProfile() {
  const params = new URLSearchParams(location.search);
  const targetUid = params.get("uid") || me.uid;
  const isSelf = targetUid === me.uid;

  const list = $("#profilePosts");
  const status = $("#profileStatus");
  const editBtn = $("#editBtn");
  const dlg = $("#editDialog");
  let profileData = null;
  let allDocs = [];
  let tab = "all";

  if (isSelf) {
    const link = $("#navProfile");
    if (link) link.setAttribute("aria-current", "page");
  }

  function renderPosts() {
    const filtered = allDocs.filter((d) => {
      const hasImage = !!d.data().imageUrl;
      if (tab === "photos") return hasImage;
      if (tab === "text") return !hasImage;
      return true;
    });
    reconcileList(list, filtered);
    status.classList.remove("error");
    status.hidden = filtered.length > 0;
    if (!filtered.length) {
      status.textContent = tab === "photos" ? "No posts with images yet."
        : tab === "text" ? "No text-only posts yet."
        : isSelf ? "You haven’t posted yet. Share something from the feed." : "No posts yet.";
    }
  }

  function renderProfile(p) {
    const name = p.displayName || "Member";
    document.title = name + " · DoorServe";
    $("#profileName").textContent = name;
    $("#profileAvatar").replaceChildren(makeAvatar(name, p.photoURL, "avatar-xl"));

    const banner = $("#banner");
    banner.replaceChildren();
    const bannerUrl = cleanUrl(p.bannerUrl);
    if (bannerUrl) {
      const img = h("img", { src: bannerUrl, alt: "", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => img.remove());
      banner.append(img);
    }

    $("#roleChip").textContent = p.role === "provider" ? "Service provider" : "Community member";
    const vChip = $("#verifyChip");
    vChip.replaceChildren();
    if (p.verified === true) {
      vChip.className = "chip chip-verified";
      vChip.title = "DoorServe has checked this provider.";
      vChip.append(icon("check"), document.createTextNode("Verified"));
    } else {
      vChip.className = "chip chip-muted";
      vChip.title = "DoorServe hasn’t verified this profile yet.";
      vChip.textContent = "Not verified yet";
    }

    $("#profileBio").textContent = p.bio ||
      (isSelf ? "Add a short bio so neighbours know who you are." : "No bio yet.");
    const joined = toDate(p.createdAt);
    $("#profileMeta").textContent = joined
      ? "Joined " + joined.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : "";
  }

  // Live profile document
  onSnapshot(doc(db, "users", targetUid), (snap) => {
    if (!snap.exists()) {
      $("#profileName").textContent = "Profile not found";
      $("#profileBio").textContent = "This person hasn’t set up a DoorServe profile.";
      editBtn.hidden = true;
      return;
    }
    profileData = snap.data({ serverTimestamps: "estimate" });
    if (isSelf) meProfile = { ...meProfile, ...profileData };
    renderProfile(profileData);
    editBtn.hidden = !isSelf;
  }, (err) => toast(friendlyError(err), "error"));

  // Live list of this person's posts. Sorted in the browser so no
  // composite Firestore index is required.
  const millis = (d) => {
    const t = d.data({ serverTimestamps: "estimate" }).createdAt;
    return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
  };
  const pq = query(collection(db, "posts"), where("uid", "==", targetUid), limit(200));
  onSnapshot(pq, (snap) => {
    allDocs = snap.docs.slice().sort((a, b) => millis(b) - millis(a));
    renderPosts();
  }, (err) => {
    status.hidden = false;
    status.classList.add("error");
    status.textContent = friendlyError(err);
  });

  // Tabs
  $$("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      renderPosts();
    });
  });

  // Edit profile (own profile only)
  const errBox = $("#editError");
  const setErr = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };

  editBtn.addEventListener("click", () => {
    if (!profileData) return;
    $("#editName").value = profileData.displayName || "";
    $("#editBio").value = profileData.bio || "";
    $("#editRole").value = profileData.role === "provider" ? "provider" : "user";
    $("#editPhoto").value = profileData.photoURL || "";
    $("#editBanner").value = profileData.bannerUrl || "";
    setErr("");
    dlg.showModal();
  });
  $("#editCancel").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    setErr("");
    const displayName = $("#editName").value.trim();
    const bio = $("#editBio").value.trim();
    const role = $("#editRole").value === "provider" ? "provider" : "user";
    const photoURL = cleanUrl($("#editPhoto").value);
    const bannerUrl = cleanUrl($("#editBanner").value);
    if (!displayName) { setErr("Your name can’t be empty."); return; }
    if (photoURL === null || bannerUrl === null) { setErr("Image links must start with https://"); return; }

    const saveBtn = $("#editSave");
    saveBtn.disabled = true;
    try {
      await updateDoc(doc(db, "users", me.uid), {
        displayName: displayName.slice(0, 60),
        bio: bio.slice(0, 280),
        role,
        photoURL,
        bannerUrl
      });
      try { await updateProfile(auth.currentUser, { displayName: displayName.slice(0, 60) }); }
      catch (e2) { /* non-critical */ }
      setupNavbarAvatar();
      dlg.close();
      toast("Profile saved.", "ok");
    } catch (err) {
      setErr(friendlyError(err));
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function setupNavbarAvatar() {
  const slot = $("#navAvatarLink");
  if (slot && meProfile) {
    slot.replaceChildren(makeAvatar(meProfile.displayName, meProfile.photoURL, "avatar-sm"));
  }
}

/* -------------------------------------------------------------------------
   9. BOOT
   ------------------------------------------------------------------------- */
function boot() {
  initTheme();
  if (!configured) {
    showFatal("open app.js and paste your Firebase web-app config into firebaseConfig.");
    return;
  }
  const page = document.body.dataset.page;
  if (page === "home") initHome();
  else if (page === "feed") guard(initFeed);
  else if (page === "profile") guard(initProfile);
}

boot();
