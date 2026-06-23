/* ============================================================
   app.js — Camada central do app de gestão (window.Gestao)
   ------------------------------------------------------------
   Responsabilidades:
   - Carregar os dados (decifra data/vault.enc com a senha) com
     override do estado salvo em localStorage ('gestao_state').
   - Persistir edições do usuário (save) e atualizar o
     indicador "salvo automaticamente".
   - Navegação por abas + registro de renderizadores pelos
     módulos (onTab / showTab).
   - Exportar / importar backup JSON.
   - Helpers de formatação pt-BR e geração de ids.

   Os módulos (visao-geral.js, cronograma.js, ...) registram
   seu renderizador com Gestao.onTab('tab-xxx', renderFn).
   O renderFn recebe (mountEl, data) e desenha dentro da aba.
   ============================================================ */

(function () {
  "use strict";

  /* ---- Constantes ---- */
  var STORAGE_KEY = "gestao_state";
  var DEFAULT_TAB = "tab-visao";
  var VAULT_URL = "data/vault.enc"; // dados cifrados (AES-GCM)

  // Estrutura vazia padrão (usada se um arquivo faltar ou falhar)
  function emptyData() {
    return {
      cronograma: { disciplinas: [], tarefas: [] },
      financeiro: { receitas: [], despesas: [] },
      contratacoes: { fornecedores: [] },
      eap: { disciplinas: [], pacotes: [] },
      canvas: {}
    };
  }

  /* ============================================================
     Helpers de formatação pt-BR
     ============================================================ */
  var brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  function fmtBRL(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return brl.format(v);
  }

  // Aceita 'AAAA-MM-DD' (ou ISO completo) e devolve 'DD/MM/AAAA'.
  // Trata a data como local para evitar deslocamento de fuso.
  function fmtData(iso) {
    if (!iso) return "";
    var s = String(iso);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return m[3] + "/" + m[2] + "/" + m[1];
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
  }

  /* ============================================================
     Geração de ids únicos
     ============================================================ */
  var _seq = 0;
  function uid(prefix) {
    _seq += 1;
    var rand = Math.random().toString(36).slice(2, 7);
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + _seq + rand;
  }

  /* ============================================================
     Estado interno
     ============================================================ */
  var Gestao = {
    data: emptyData(),
    _tabs: {},          // id -> renderFn
    _activeTab: null,
    _loaded: false,

    fmtBRL: fmtBRL,
    fmtData: fmtData,
    uid: uid
  };

  /* ---- Indicador "salvo" ---- */
  var _saveTimer = null;
  function setSaveStatus(state, text) {
    var el = document.getElementById("save-status");
    if (!el) return;
    el.setAttribute("data-state", state);
    var label = el.querySelector(".save-label");
    if (label) label.textContent = text;
  }

  /* ============================================================
     Carregamento de dados
     ============================================================ */

  // Lê e aplica overrides do localStorage sobre os dados base.
  // O estado salvo TEM PRIORIDADE (são as edições do usuário).
  function applySavedState(base) {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return base; // localStorage pode estar bloqueado
    }
    if (!raw) return base;
    try {
      var saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        // Override por chave de domínio (merge raso, salvo ganha)
        var merged = {};
        Object.keys(base).forEach(function (k) {
          merged[k] = saved[k] !== undefined ? saved[k] : base[k];
        });
        // Mantém chaves extras que existam só no salvo
        Object.keys(saved).forEach(function (k) {
          if (merged[k] === undefined) merged[k] = saved[k];
        });
        return merged;
      }
    } catch (e) {
      console.warn("Estado salvo inválido, ignorando.", e);
    }
    return base;
  }

  /* ---- Decifragem do vault (Web Crypto: PBKDF2 + AES-GCM) ---- */
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Decifra o vault com a senha. Resolve com o objeto de dados ou
  // rejeita com motivo: 'senha' (senha errada) ou 'rede' (fetch falhou).
  function decryptVault(password) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) {
      return Promise.reject(new Error("rede")); // sem Web Crypto (http inseguro?)
    }
    return fetch(VAULT_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("rede");
        return res.json();
      })
      .then(function (vault) {
        var salt = b64ToBytes(vault.salt);
        var iv = b64ToBytes(vault.iv);
        var ct = b64ToBytes(vault.ct);
        var enc = new TextEncoder();
        return subtle
          .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
          .then(function (baseKey) {
            return subtle.deriveKey(
              {
                name: "PBKDF2",
                salt: salt,
                iterations: vault.iter || 150000,
                hash: "SHA-256"
              },
              baseKey,
              { name: "AES-GCM", length: 256 },
              false,
              ["decrypt"]
            );
          })
          .then(function (key) {
            return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
          })
          .then(function (plainBuf) {
            var json = new TextDecoder().decode(plainBuf);
            return JSON.parse(json); // { cronograma, financeiro, ... }
          })
          .catch(function () {
            // Falha de decrypt = senha incorreta (tag GCM não bate).
            throw new Error("senha");
          });
      })
      .catch(function (err) {
        if (err && err.message === "senha") throw err;
        throw new Error("rede");
      });
  }

  // Mostra aviso global quando o fetch é bloqueado (ex.: file://).
  function showFetchWarning() {
    var holder = document.getElementById("app-banner");
    if (!holder) return;
    holder.innerHTML =
      '<div class="notice error app-banner" role="alert">' +
      "<strong>Não foi possível carregar os dados.</strong> " +
      "Se você abriu o arquivo direto pelo navegador (<code>file://</code>), " +
      "alguns navegadores bloqueiam o carregamento. Rode um servidor local " +
      "— por exemplo <code>python -m http.server</code> nesta pasta — e abra " +
      "<code>http://localhost:8000</code>, ou use o deploy publicado." +
      "</div>";
  }

  // Recebe os dados já decifrados, mescla com o estado salvo do
  // usuário (localStorage tem prioridade) e marca como carregado.
  Gestao.load = function load(decrypted) {
    var base = emptyData();
    if (decrypted && typeof decrypted === "object") {
      Object.keys(base).forEach(function (k) {
        if (decrypted[k] !== undefined) base[k] = decrypted[k];
      });
    }
    Gestao.data = applySavedState(base);
    Gestao._loaded = true;
    setSaveStatus("idle", "salvo automaticamente");
    return Promise.resolve(Gestao.data);
  };

  /* ============================================================
     Persistência
     ============================================================ */
  Gestao.save = function save() {
    setSaveStatus("saving", "salvando…");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Gestao.data));
    } catch (e) {
      console.error("Falha ao salvar no localStorage:", e);
      setSaveStatus("error", "erro ao salvar");
      return false;
    }
    // Pequeno debounce visual para o estado "salvo".
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      setSaveStatus("idle", "salvo automaticamente");
    }, 400);
    return true;
  };

  /* ============================================================
     Registro de abas + navegação
     ============================================================ */
  Gestao.onTab = function onTab(id, renderFn) {
    if (typeof renderFn !== "function") {
      console.warn("onTab: renderFn inválido para", id);
      return;
    }
    Gestao._tabs[id] = renderFn;
    // Se essa é a aba já ativa, renderiza imediatamente
    // (módulo carregou depois da troca de aba).
    if (Gestao._activeTab === id && Gestao._loaded) {
      renderTab(id);
    }
  };

  function renderTab(id) {
    var mount = document.getElementById(id);
    if (!mount) return;
    var fn = Gestao._tabs[id];
    if (!fn) return; // módulo ainda não registrou — mantém placeholder
    try {
      fn(mount, Gestao.data);
    } catch (e) {
      console.error("Erro ao renderizar aba " + id + ":", e);
      mount.innerHTML =
        '<div class="notice error" role="alert">' +
        "Erro ao montar esta seção. Veja o console para detalhes." +
        "</div>";
    }
  }

  Gestao.showTab = function showTab(id) {
    Gestao._activeTab = id;

    // Alterna visibilidade das sections e estado dos botões.
    var panels = document.querySelectorAll(".tab-panel");
    panels.forEach(function (p) {
      p.hidden = p.id !== id;
    });

    var btns = document.querySelectorAll(".tab-btn");
    btns.forEach(function (b) {
      var selected = b.getAttribute("data-tab") === id;
      b.setAttribute("aria-selected", selected ? "true" : "false");
      b.tabIndex = selected ? 0 : -1;
    });

    if (Gestao._loaded) renderTab(id);
  };

  // Re-renderiza a aba ativa (útil após import / edições).
  function rerenderActive() {
    if (Gestao._activeTab) renderTab(Gestao._activeTab);
  }

  /* ============================================================
     Exportar / Importar backup JSON
     ============================================================ */
  function todayStr() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  Gestao.exportJSON = function exportJSON() {
    var payload = JSON.stringify(Gestao.data, null, 2);
    var blob = new Blob([payload], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "backup-gestao-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  };

  // Lê um File, valida JSON, substitui this.data, salva e re-renderiza.
  Gestao.importJSON = function importJSON(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error("Nenhum arquivo selecionado."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Não foi possível ler o arquivo."));
      };
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch (e) {
          reject(new Error("Arquivo não é um JSON válido."));
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("Backup inválido: esperado um objeto JSON."));
          return;
        }
        // Substitui mantendo o formato esperado das chaves de domínio.
        var base = emptyData();
        Object.keys(base).forEach(function (k) {
          if (parsed[k] !== undefined) base[k] = parsed[k];
        });
        Gestao.data = base;
        Gestao.save();
        rerenderActive();
        resolve(Gestao.data);
      };
      reader.readAsText(file);
    });
  };

  /* ============================================================
     Ligação da UI (botões, abas, import)
     ============================================================ */
  function wireUI() {
    // Navegação por abas
    var btns = document.querySelectorAll(".tab-btn");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        Gestao.showTab(b.getAttribute("data-tab"));
      });
      // Acessibilidade: setas navegam entre abas
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        var list = Array.prototype.slice.call(btns);
        var idx = list.indexOf(b);
        var next =
          e.key === "ArrowRight"
            ? list[(idx + 1) % list.length]
            : list[(idx - 1 + list.length) % list.length];
        next.focus();
        Gestao.showTab(next.getAttribute("data-tab"));
      });
    });

    // Exportar
    var btnExport = document.getElementById("btn-export");
    if (btnExport) {
      btnExport.addEventListener("click", function () {
        Gestao.exportJSON();
      });
    }

    // Importar (abre o seletor de arquivo)
    var btnImport = document.getElementById("btn-import");
    var fileInput = document.getElementById("import-file");
    if (btnImport && fileInput) {
      btnImport.addEventListener("click", function () {
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        Gestao.importJSON(file)
          .then(function () {
            setSaveStatus("idle", "backup importado");
          })
          .catch(function (err) {
            alert("Falha ao importar: " + err.message);
          })
          .finally(function () {
            fileInput.value = ""; // permite reimportar o mesmo arquivo
          });
      });
    }
  }

  /* ============================================================
     Tela de senha (gate) — decifra o vault antes de liberar o app
     ============================================================ */
  function buildGate() {
    var overlay = document.createElement("div");
    overlay.id = "gate-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Acesso restrito");

    var card = document.createElement("div");
    card.className = "gate-card";

    var logo = document.createElement("img");
    logo.className = "gate-logo";
    logo.src = "assets/pmirs-horizontal-color.png";
    logo.alt = "PMI Rio Grande do Sul Chapter";
    card.appendChild(logo);

    var h = document.createElement("h1");
    h.className = "gate-title";
    h.textContent = "Summit 2026 · Gestão";
    var p = document.createElement("p");
    p.className = "gate-sub";
    p.textContent = "Área restrita. Informe a senha para acessar as informações.";

    var form = document.createElement("form");
    form.className = "gate-form";
    var input = document.createElement("input");
    input.type = "password";
    input.className = "gate-input";
    input.placeholder = "Senha";
    input.autocomplete = "current-password";
    input.setAttribute("aria-label", "Senha");
    var btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "gate-btn";
    btn.textContent = "Entrar";
    var msg = document.createElement("div");
    msg.className = "gate-msg";
    msg.setAttribute("aria-live", "polite");

    form.appendChild(input);
    form.appendChild(btn);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(form);
    card.appendChild(msg);
    overlay.appendChild(card);

    // Estilos do gate (injetados para manter o componente autocontido).
    var css = document.createElement("style");
    css.textContent =
      "#gate-overlay{position:fixed;inset:0;z-index:9999;display:flex;" +
      "align-items:center;justify-content:center;padding:24px;" +
      "background:linear-gradient(160deg,#36177B,#1A1140);}" +
      ".gate-card{width:100%;max-width:380px;background:#fff;border-radius:16px;" +
      "padding:32px 28px;box-shadow:0 30px 80px rgba(0,0,0,.35);text-align:center;}" +
      ".gate-logo{height:54px;width:auto;margin:0 auto 18px;display:block;}" +
      ".gate-title{font-size:20px;color:#1A1230;margin:0 0 6px;}" +
      ".gate-sub{font-size:14px;color:#6B6480;margin:0 0 22px;line-height:1.5;}" +
      ".gate-form{display:flex;flex-direction:column;gap:12px;}" +
      ".gate-input{width:100%;padding:13px 14px;font-size:15px;border:1px solid #E7E3EE;" +
      "border-radius:10px;outline:none;}" +
      ".gate-input:focus{border-color:#36177B;box-shadow:0 0 0 3px rgba(54,23,123,.15);}" +
      ".gate-btn{width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;" +
      "background:#36177B;border:none;border-radius:10px;cursor:pointer;}" +
      ".gate-btn:hover{background:#4A1D8A;}" +
      ".gate-btn[disabled]{opacity:.6;cursor:default;}" +
      ".gate-msg{min-height:18px;margin-top:12px;font-size:13px;color:#E0611F;}";
    document.head.appendChild(css);

    return { overlay: overlay, input: input, btn: btn, msg: msg, form: form };
  }

  function startGate(onUnlock) {
    var g = buildGate();
    document.body.appendChild(g.overlay);
    setTimeout(function () {
      g.input.focus();
    }, 50);

    g.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var senha = g.input.value;
      if (!senha) return;
      g.btn.disabled = true;
      g.msg.textContent = "Verificando…";
      g.msg.style.color = "#6B6480";

      decryptVault(senha)
        .then(function (data) {
          // Sucesso: remove o gate e libera o app.
          g.overlay.parentNode && g.overlay.parentNode.removeChild(g.overlay);
          onUnlock(data);
        })
        .catch(function (err) {
          g.btn.disabled = false;
          g.msg.style.color = "#E0611F";
          if (err && err.message === "rede") {
            g.msg.textContent =
              "Não foi possível carregar os dados. Use um servidor (http), não file://.";
          } else {
            g.msg.textContent = "Senha incorreta. Tente novamente.";
            g.input.select();
          }
        });
    });
  }

  /* ============================================================
     Bootstrap
     ============================================================ */
  function boot() {
    wireUI();
    setSaveStatus("saving", "bloqueado");
    // Mostra a tela de senha; só libera o app após decifrar o vault.
    startGate(function (decrypted) {
      Gestao.load(decrypted).then(function () {
        Gestao.showTab(DEFAULT_TAB);
      });
    });
  }

  // Expõe globalmente para os módulos.
  window.Gestao = Gestao;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
