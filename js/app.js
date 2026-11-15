// Point d'entrée : session, navigation, structure de l'application.
import { sb } from "./supabase.js";
import { state } from "./state.js";
import * as api from "./api.js";
import { showAuth, showRecovery, showFatal } from "./auth.js";
import { loadingBlock, errorBlock, destroyCharts, refreshIcons, toast, $ } from "./ui.js";
import { esc } from "./utils.js";
import { applyTheme, getTheme, effectiveTheme } from "./theme.js";

applyTheme(getTheme());

const ROUTES = {
  "/": { title: "Tableau de bord", icon: "layout-dashboard", mod: () => import("./views/dashboard.js") },
  "/transactions": { title: "Transactions", icon: "arrow-left-right", mod: () => import("./views/transactions.js") },
  "/budgets": { title: "Budgets", icon: "target", mod: () => import("./views/budgets.js") },
  "/epargne": { title: "Épargne", icon: "piggy-bank", mod: () => import("./views/savings.js") },
  "/stats": { title: "Statistiques", icon: "bar-chart-3", mod: () => import("./views/stats.js") },
  "/parametres": { title: "Paramètres", icon: "settings", mod: () => import("./views/settings.js") },
};
const MOBILE_NAV = ["/", "/transactions", "/budgets", "/epargne", "/parametres"];
const LOGO = `<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V7l7 7 7-7v12"/></svg></span>`;

// Deux icônes : la lune (en thème clair) et le soleil (en thème sombre) ; le CSS affiche la bonne.
const THEME_ICONS = `<i data-lucide="moon" class="ico-moon"></i><i data-lucide="sun" class="ico-sun"></i>`;

const routePath = () => {
  const p = (location.hash.replace(/^#/, "") || "/").replace(/\/+$/, "") || "/";
  return ROUTES[p] ? p : "/";
};

let renderToken = 0;
let mounted = false;

function mountShell() {
  const link = (p, cls = "") => `<a href="#${p}" data-route="${p}" class="${cls}"><i data-lucide="${ROUTES[p].icon}"></i><span>${esc(ROUTES[p].title)}</span></a>`;
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">${LOGO}<span>MyBudget</span></div>
        <nav class="nav">${Object.keys(ROUTES).map((p) => link(p)).join("")}</nav>
        <div class="sidebar-foot">
          <button class="btn" type="button" data-toggle-theme>${THEME_ICONS}<span>Changer de thème</span></button>
          <button class="btn" type="button" data-logout><i data-lucide="log-out"></i>Déconnexion</button>
        </div>
      </aside>
      <div class="main-col">
        <header class="topbar"><h1 id="page-title"></h1>
          <div class="topbar-right"><span class="user-name" id="user-name"></span><div class="avatar" id="avatar"></div>
            <button class="icon-btn" type="button" data-toggle-theme aria-label="Changer de thème">${THEME_ICONS}</button>
            <button class="icon-btn" type="button" data-logout aria-label="Déconnexion"><i data-lucide="log-out"></i></button></div></header>
        <main id="view"></main>
      </div>
    </div>
    <nav class="bottom-nav">${MOBILE_NAV.map((p) => link(p)).join("")}</nav>`;
  refreshIcons();
  document.querySelectorAll("[data-logout]").forEach((b) => b.addEventListener("click", () => sb.auth.signOut()));
  // NB : l'attribut s'appelle data-toggle-theme (et pas data-theme, déjà utilisé par la balise <html>).
  document.querySelectorAll("[data-toggle-theme]").forEach((b) =>
    b.addEventListener("click", () => applyTheme(effectiveTheme() === "dark" ? "light" : "dark")));
  updateUserBits();
  mounted = true;
}

function updateUserBits() {
  const name = state.profile?.display_name || state.user?.email || "";
  $("#user-name") && ($("#user-name").textContent = name);
  $("#avatar") && ($("#avatar").textContent = (name.trim()[0] || "?").toUpperCase());
}
document.addEventListener("profile-updated", updateUserBits);

async function route() {
  if (!mounted || !state.user) return;
  const path = routePath();
  const def = ROUTES[path];
  const token = ++renderToken;
  document.querySelectorAll("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === path));
  $("#page-title").textContent = def.title;
  document.title = `${def.title} · MyBudget`;
  const view = $("#view");
  destroyCharts();
  view.innerHTML = `<div class="view">${loadingBlock()}</div>`;
  try {
    const mod = await def.mod();
    if (token !== renderToken) return;
    const box = document.createElement("div");
    box.className = "view";
    await mod.render(box);
    if (token !== renderToken) return;
    view.replaceChildren(box);
    refreshIcons();
    window.scrollTo(0, 0);
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    view.innerHTML = `<div class="view">${errorBlock(e.message || "Erreur inconnue.")}</div>`;
    $("[data-retry]", view)?.addEventListener("click", route);
  }
}
window.addEventListener("hashchange", route);
// Changement de thème : on redessine la page (les graphiques reprennent les bonnes couleurs).
document.addEventListener("theme-changed", () => { if (mounted) route(); });

async function startApp(user) {
  state.user = user;
  try {
    const [profile, categories] = await Promise.all([api.getProfile(), api.listCategories()]);
    state.profile = profile || { display_name: user.email, currency: "EUR" };
    state.categories = categories;
  } catch (e) {
    showFatal(e.message, () => startApp(user));
    return;
  }
  mountShell();
  await route();
}

function stopApp() {
  state.user = null; state.profile = null; state.categories = []; state.month = null;
  mounted = false;
  renderToken++;
  destroyCharts();
  showAuth("login");
}

// ---------- Démarrage et suivi de la session ----------
let currentUserId = null;

sb.auth.onAuthStateChange((event, session) => {
  // NB : pas d'appel Supabase directement ici (risque de blocage) -> on repasse par setTimeout.
  setTimeout(async () => {
    if (event === "PASSWORD_RECOVERY") {
      state.recovery = true;
      showRecovery(() => { state.recovery = false; location.hash = "#/"; startApp(session.user); });
      return;
    }
    if (state.recovery) return;
    if (session?.user) {
      if (currentUserId !== session.user.id) { currentUserId = session.user.id; await startApp(session.user); }
    } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
      currentUserId = null;
      stopApp();
    }
  }, 0);
});

window.addEventListener("online", () => toast("Connexion rétablie"));
window.addEventListener("offline", () => toast("Tu es hors ligne", "error"));
