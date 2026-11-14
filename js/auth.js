// Écrans d'authentification : connexion, inscription, mot de passe oublié, nouveau mot de passe.
import { sb } from "./supabase.js";
import { bindForm, $, refreshIcons } from "./ui.js";
import { esc } from "./utils.js";

const LOGO = `<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V7l7 7 7-7v12"/></svg></span>`;

function authError(error) {
  const m = error?.message || "";
  if (/Invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Confirme d'abord ton adresse email (lien reçu par mail).";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet email.";
  if (/Password should be at least/i.test(m)) return "Le mot de passe est trop court (8 caractères minimum).";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Connexion impossible. Vérifie ta connexion internet.";
  return m || "Une erreur est survenue.";
}

function shell(inner) {
  document.getElementById("app").innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="brand">${LOGO}<span>MyBudget</span></div>
      ${inner}
    </div></div>`;
  refreshIcons();
}

export function showAuth(initial = "login") {
  if (initial === "reset") return showReset();
  const isLogin = initial === "login";
  shell(`
    <p class="auth-sub">Ta gestion financière, simplement.</p>
    <div class="auth-tabs">
      <button type="button" data-tab="login" class="${isLogin ? "active" : ""}">Connexion</button>
      <button type="button" data-tab="signup" class="${!isLogin ? "active" : ""}">Inscription</button>
    </div>
    <form id="auth-form" novalidate>
      <div class="form-error" hidden></div>
      <div class="form-ok" hidden></div>
      ${isLogin ? "" : `<div class="field"><label for="name">Prénom ou pseudo</label>
        <input class="input" id="name" name="name" autocomplete="nickname" maxlength="40" /></div>`}
      <div class="field"><label for="email">Email</label>
        <input class="input" id="email" name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label for="password">Mot de passe</label>
        <input class="input" id="password" name="password" type="password" required
          autocomplete="${isLogin ? "current-password" : "new-password"}" minlength="8" />
        ${isLogin ? "" : `<span class="hint">8 caractères minimum.</span>`}</div>
      <button class="btn btn-primary btn-block" type="submit">${isLogin ? "Se connecter" : "Créer mon compte"}</button>
    </form>
    ${isLogin ? `<div class="auth-links"><button class="link-btn" type="button" data-reset>Mot de passe oublié ?</button></div>` : ""}
  `);

  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => showAuth(b.dataset.tab)));
  $("[data-reset]")?.addEventListener("click", showReset);

  const form = $("#auth-form");
  bindForm(form, async (fd) => {
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Adresse email invalide.");
    if (password.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères.");

    if (isLogin) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(authError(error));
      return; // la suite est gérée par onAuthStateChange (app.js)
    }
    const name = String(fd.get("name") || "").trim();
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: name ? { display_name: name } : {}, emailRedirectTo: location.origin },
    });
    if (error) throw new Error(authError(error));
    if (!data.session) {
      const ok = $(".form-ok", form);
      ok.textContent = "Compte créé ! Vérifie ta boîte mail et clique sur le lien de confirmation, puis connecte-toi.";
      ok.hidden = false;
    }
  });
}

function showReset() {
  shell(`
    <p class="auth-sub">Entre ton email : on t'envoie un lien pour choisir un nouveau mot de passe.</p>
    <form id="reset-form" novalidate>
      <div class="form-error" hidden></div>
      <div class="form-ok" hidden></div>
      <div class="field"><label for="email">Email</label>
        <input class="input" id="email" name="email" type="email" autocomplete="email" required /></div>
      <button class="btn btn-primary btn-block" type="submit">Envoyer le lien</button>
    </form>
    <div class="auth-links"><button class="link-btn" type="button" data-back>Retour à la connexion</button></div>
  `);
  $("[data-back]").addEventListener("click", () => showAuth("login"));
  const form = $("#reset-form");
  bindForm(form, async (fd) => {
    const email = String(fd.get("email") || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Adresse email invalide.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw new Error(authError(error));
    const ok = $(".form-ok", form);
    ok.textContent = "Si un compte existe pour cet email, un lien vient d'être envoyé.";
    ok.hidden = false;
  });
}

/** Affiché quand l'utilisateur arrive depuis le lien "mot de passe oublié". */
export function showRecovery(onDone) {
  shell(`
    <p class="auth-sub">Choisis ton nouveau mot de passe.</p>
    <form id="recovery-form" novalidate>
      <div class="form-error" hidden></div>
      <div class="field"><label for="password">Nouveau mot de passe</label>
        <input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
        <span class="hint">8 caractères minimum.</span></div>
      <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
    </form>
  `);
  bindForm($("#recovery-form"), async (fd) => {
    const password = String(fd.get("password") || "");
    if (password.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(authError(error));
    onDone();
  });
}

export function showFatal(message, onRetry) {
  shell(`
    <p class="auth-sub">Impossible de démarrer l'application.</p>
    <div class="form-error">${esc(message)}</div>
    <button class="btn btn-block" type="button" data-retry>Réessayer</button>
    <div class="auth-links"><button class="link-btn" type="button" data-logout>Se déconnecter</button></div>
  `);
  $("[data-retry]").addEventListener("click", onRetry);
  $("[data-logout]").addEventListener("click", () => sb.auth.signOut());
}
