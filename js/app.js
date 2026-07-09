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

  // --- Modo backend (servidor Node + Postgres) ---
  var PING_URL = "/api/ping"; // detecção de modo em runtime
  var SAVE_DEBOUNCE_MS = 600; // espera antes de PUT no servidor
  var SYNC_INTERVAL_MS = 5000; // polling leve de sincronização

  // Estrutura vazia padrão (usada se um arquivo faltar ou falhar)
  function emptyData() {
    return {
      cronograma: { disciplinas: [], tarefas: [] },
      financeiro: { receitas: [], despesas: [] },
      contratacoes: { fornecedores: [] },
      eap: { disciplinas: [], pacotes: [] },
      canvas: {},
      reunioes: { reunioes: [] },
      documentos: { documentos: [] },
      equipe: { membros: [] },
      checklist: { itens: [] },
      palestrantes: { palcos: [] },
      prospeccao: { candidatos: [] }
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
     Cabeçalho padrão de aba (Gestao.pageHeader / Gestao.headerStat)
     ------------------------------------------------------------
     Reproduz o estilo do cabeçalho da aba Cronograma (.cro-header):
     logo + divisória vertical + eyebrow/título/subtítulo à esquerda
     e um bloco de contexto opcional à direita. As classes ficam em
     css/app.css (.page-head*). Tudo via createElement/textContent
     (nunca innerHTML com dados) — seguro contra XSS.
     ============================================================ */
  var HEADER_LOGO_SRC = "assets/pmirs-horizontal-color.png";
  var HEADER_LOGO_ALT = "PMI Rio Grande do Sul Chapter";

  // Cria um elemento com classe/texto opcionais (helper local enxuto).
  function mkEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  // Cabeçalho padrão. opts = { eyebrow, title, subtitle, right }
  // - eyebrow/title/subtitle: strings (texto seguro via textContent).
  // - right: elemento DOM opcional para o lado direito (cartão/realce).
  // Retorna um <header class="page-head">.
  function pageHeader(opts) {
    opts = opts || {};

    var logo = mkEl("img", "page-head__logo");
    logo.src = HEADER_LOGO_SRC;
    logo.alt = HEADER_LOGO_ALT;

    var divider = mkEl("span", "page-head__divider");
    divider.setAttribute("aria-hidden", "true");

    var titleWrap = mkEl("div", "page-head__titlewrap");
    if (opts.eyebrow) {
      titleWrap.appendChild(mkEl("p", "page-head__eyebrow", opts.eyebrow));
    }
    titleWrap.appendChild(mkEl("h2", "page-head__title", opts.title || ""));
    if (opts.subtitle) {
      titleWrap.appendChild(mkEl("p", "page-head__sub", opts.subtitle));
    }

    var left = mkEl("div", "page-head__left");
    left.appendChild(logo);
    left.appendChild(divider);
    left.appendChild(titleWrap);

    var header = mkEl("header", "page-head");
    header.setAttribute("aria-label", opts.title || "Cabeçalho da seção");
    header.appendChild(left);

    if (opts.right) {
      var right = mkEl("div", "page-head__right");
      right.appendChild(opts.right);
      header.appendChild(right);
    }

    return header;
  }

  // Cartãozinho de destaque para o lado direito do cabeçalho.
  // opts = { label, value, sub, accent }
  // - accent true  -> fundo roxo (#36177B) com texto branco.
  // - accent false -> bloco claro (creme) com texto escuro.
  // Retorna um <div class="head-stat">.
  function headerStat(opts) {
    opts = opts || {};
    var card = mkEl("div", "head-stat" + (opts.accent ? " is-accent" : ""));
    if (opts.label) {
      card.appendChild(mkEl("span", "head-stat__label", opts.label));
    }
    card.appendChild(mkEl("span", "head-stat__value", opts.value != null ? opts.value : ""));
    if (opts.sub) {
      card.appendChild(mkEl("span", "head-stat__sub", opts.sub));
    }
    return card;
  }

  /* ============================================================
     Estado interno
     ============================================================ */
  var Gestao = {
    data: emptyData(),
    _tabs: {},          // id -> renderFn
    _activeTab: null,
    _loaded: false,

    // --- Modo de operação ---
    // mode: 'vault' (estático, fallback) | 'backend' (servidor Node)
    mode: "vault",
    role: null,          // 'master' | 'viewer' | área (governanca/conteudo/experiencia)
    readonly: false,     // true quando role === 'viewer' (só leitura total)
    areaKeys: null,      // chaves editáveis do perfil de área (null = todas)

    fmtBRL: fmtBRL,
    fmtData: fmtData,
    uid: uid,
    pageHeader: pageHeader,
    headerStat: headerStat
  };

  // Estado interno do modo backend.
  var _lastUpdatedAt = null; // marca temporal do último estado conhecido
  var _backendSaveTimer = null; // debounce do PUT
  var _syncTimer = null; // intervalo do polling

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
    var seedV = null;
    if (decrypted && typeof decrypted === "object") {
      Object.keys(base).forEach(function (k) {
        if (decrypted[k] !== undefined) base[k] = decrypted[k];
      });
      seedV = decrypted.__v != null ? String(decrypted.__v) : null;
    }

    // Descarte automático de estado local antigo: se a versão publicada
    // dos dados (__v) mudou, ignora o localStorage e usa os dados novos.
    // Assim o usuário NÃO precisa limpar cache manualmente.
    var storedV = null;
    try { storedV = localStorage.getItem("gestao_seed_v"); } catch (e) {}
    if (seedV && seedV !== storedV) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem("gestao_seed_v", seedV);
      } catch (e) {}
      Gestao.data = base; // dados publicados vencem (sem override local)
    } else {
      Gestao.data = applySavedState(base);
    }

    Gestao._loaded = true;
    setSaveStatus("idle", "salvo automaticamente");
    return Promise.resolve(Gestao.data);
  };

  /* ============================================================
     Persistência
     ------------------------------------------------------------
     save() decide o destino conforme o modo:
     - vault   -> localStorage (comportamento estático original).
     - backend -> PUT /api/estado (só se role === 'master';
                  viewer é no-op). Sempre cacheia em localStorage
                  como espelho offline opcional.
     ============================================================ */
  Gestao.save = function save() {
    if (Gestao.mode === "backend") {
      return saveBackend();
    }
    return saveVault();
  };

  // Persistência local (modo vault — comportamento original intacto).
  function saveVault() {
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
  }

  // Persistência no servidor (modo backend). Viewer não salva.
  // Perfis de área salvam normalmente: o SERVIDOR aplica apenas as
  // chaves permitidas do payload (merge raso), ignorando o resto.
  function saveBackend() {
    if (Gestao.role === "viewer" || !Gestao.role) {
      return false; // somente leitura — no-op silencioso
    }
    // Espelho offline opcional (não é a fonte da verdade).
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Gestao.data));
    } catch (e) {
      /* cache opcional: ignora falha */
    }

    setSaveStatus("saving", "salvando…");
    if (_backendSaveTimer) clearTimeout(_backendSaveTimer);
    _backendSaveTimer = setTimeout(function () {
      // Zera antes de enviar: _backendSaveTimer sinaliza "escrita pendente"
      // e é o que mantém o polling pausado enquanto o debounce corre.
      _backendSaveTimer = null;
      enviarEstado().catch(function () {
        /* erro já reportado em enviarEstado */
      });
    }, SAVE_DEBOUNCE_MS);
    return true;
  }

  // PUT do estado atual. Devolve a Promise para quem precisa esperar a
  // gravação terminar (ex.: o logout não pode sair com save pendente).
  function enviarEstado() {
    // Snapshot do que será enviado (evita corrida com edições novas).
    var payload = JSON.stringify({ data: Gestao.data });
    return fetch("/api/estado", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      })
      .then(function (out) {
        // Atualiza a marca temporal para o polling não "ressincronizar"
        // por cima da própria escrita do master.
        if (out && out.updated_at) _lastUpdatedAt = out.updated_at;
        setSaveStatus("idle", "salvo");
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function () {
          setSaveStatus("idle", "salvo automaticamente");
        }, 1500);
      })
      .catch(function (err) {
        console.error("Falha ao salvar no servidor:", err);
        setSaveStatus("error", "erro ao salvar");
        throw err;
      });
  }

  // Antecipa um save em debounce. Resolve quando o estado estiver gravado.
  function flushSaveBackend() {
    if (!_backendSaveTimer) return Promise.resolve();
    clearTimeout(_backendSaveTimer);
    _backendSaveTimer = null;
    return enviarEstado();
  }

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

  /* ---- Permissão de edição por aba (perfis de área) --------
     Mapeia cada aba para a chave de domínio que ela edita.
     Abas derivadas/agregadas (visão, disciplinas, relatórios)
     não têm chave própria => só o master edita.               */
  var TAB_KEYS = {
    "tab-visao": null,
    "tab-cronograma": "cronograma",
    "tab-eap": "eap",
    "tab-disciplinas": null,
    "tab-financeiro": "financeiro",
    "tab-contratacoes": "contratacoes",
    "tab-palestrantes": "palestrantes",
    "tab-prospeccao": "prospeccao",
    "tab-patrocinio": "patrocinio",
    "tab-equipe": "equipe",
    "tab-voluntarios": "voluntarios",
    "tab-reunioes": "reunioes",
    "tab-documentos": "documentos",
    "tab-relatorios": null,
    "tab-metas": "metas",
    "tab-checklist": "checklist"
  };

  // A aba pode ser editada pelo perfil atual?
  // - modo vault: sempre (comportamento original);
  // - master: sempre; viewer: nunca;
  // - perfil de área: só se a chave da aba estiver em areaKeys.
  function tabEditavel(id) {
    if (Gestao.mode !== "backend") return true;
    if (Gestao.role === "master") return true;
    if (Gestao.role === "viewer" || !Gestao.role) return false;
    var key = TAB_KEYS[id];
    return !!(key && Gestao.areaKeys && Gestao.areaKeys.indexOf(key) !== -1);
  }

  Gestao.tabEditavel = tabEditavel;

  function renderTab(id) {
    var mount = document.getElementById(id);
    if (!mount) return;
    var fn = Gestao._tabs[id];
    if (!fn) return; // módulo ainda não registrou — mantém placeholder
    try {
      fn(mount, Gestao.data);
      // Esconde controles de edição (heurística) quando o perfil
      // atual não pode editar esta aba — viewer em tudo; perfil de
      // área nas abas fora do seu tema.
      if (!tabEditavel(id)) aplicarReadonly(mount);
    } catch (e) {
      console.error("Erro ao renderizar aba " + id + ":", e);
      mount.innerHTML =
        '<div class="notice error" role="alert">' +
        "Erro ao montar esta seção. Veja o console para detalhes." +
        "</div>";
    }
  }

  /* ============================================================
     Modo somente-leitura (viewer) — esconde controles de edição
     ------------------------------------------------------------
     Heurística aplicada DEPOIS do render do módulo, dentro do
     mount da aba. Esconde:
     - todo button.btn-primary;
     - botões cujo texto bata com (+|editar|excluir|remover|
       salvar|nova|novo) no início;
     - barras/toolbars de "+ ..." (heurística por classe).
     Esconder (não remover) preserva o layout e é reversível.
     ============================================================ */
  var READONLY_TEXTO = /^\s*(\+|editar|excluir|remover|salvar|nova|novo)\b/i;

  function esconder(node) {
    if (node && node.style) node.style.display = "none";
  }

  function aplicarReadonly(mount) {
    if (!mount) return;

    // 1) Botões primários (adicionar/salvar) — sempre escondidos.
    mount.querySelectorAll("button.btn-primary").forEach(esconder);

    // 2) Botões por texto (Editar/Excluir/Remover/Salvar/Nova/Novo/+...).
    mount.querySelectorAll("button").forEach(function (b) {
      var txt = (b.textContent || "").trim();
      if (READONLY_TEXTO.test(txt)) esconder(b);
    });

    // 3) Toolbars de adicionar (heurística por classe contendo "toolbar").
    //    Esconde apenas se a barra contiver algum controle de ação.
    mount.querySelectorAll('[class*="toolbar"]').forEach(function (bar) {
      var temAcao = bar.querySelector(
        "button.btn-primary, input, select, textarea"
      );
      if (temAcao) esconder(bar);
    });

    // 4) Campos de edição (select/input/textarea) — desabilita no modo
    //    usuário. Cobre casos sem botão, como o <select> de status do
    //    kanban de Contratações (mover item entre colunas).
    mount.querySelectorAll("select, input, textarea").forEach(function (el) {
      el.disabled = true;
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
    });
  }

  Gestao.aplicarReadonly = aplicarReadonly;

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
  // No modo backend, importar é privilégio do master.
  Gestao.importJSON = function importJSON(file) {
    return new Promise(function (resolve, reject) {
      // Import substitui o estado INTEIRO — no backend, só o master pode.
      if (
        Gestao.readonly ||
        (Gestao.mode === "backend" && Gestao.role !== "master")
      ) {
        reject(new Error("Sem permissão para importar (somente leitura)."));
        return;
      }
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

    // Importar (abre o seletor de arquivo) — só master/vault.
    var btnImport = document.getElementById("btn-import");
    var fileInput = document.getElementById("import-file");
    // Viewer (backend somente leitura): esconde o botão Importar.
    if (btnImport && Gestao.readonly) {
      btnImport.style.display = "none";
    }
    if (btnImport && fileInput) {
      btnImport.addEventListener("click", function () {
        if (Gestao.readonly) return; // guarda extra
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

    // Sair — revelado por aplicarRole(), só existe no modo backend.
    var btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", function () {
        fazerLogout();
      });
    }
  }

  /* ============================================================
     Tela de senha (gate) — decifra o vault antes de liberar o app
     ============================================================ */
  function buildGate(opts) {
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
    h.textContent = (opts && opts.title) || "Summit 2026 · Gestão";
    var p = document.createElement("p");
    p.className = "gate-sub";
    p.textContent =
      (opts && opts.subtitle) ||
      "Área restrita. Informe a senha para acessar as informações.";

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
     Modo backend — login, carga e sincronização
     ============================================================ */

  // Detecta se há servidor: GET /api/ping com {backend:true}.
  // Resolve true (modo backend) ou false (modo vault/estático).
  // Qualquer erro de rede (ex.: GitHub Pages, file://) => false.
  function detectarBackend() {
    if (typeof fetch !== "function") return Promise.resolve(false);
    return fetch(PING_URL, { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) return false;
        return res
          .json()
          .then(function (j) {
            return !!(j && j.backend === true);
          })
          .catch(function () {
            return false;
          });
      })
      .catch(function () {
        return false; // sem servidor -> fallback vault
      });
  }

  // Carrega o estado do servidor para Gestao.data (fonte da verdade).
  function carregarEstadoBackend() {
    return fetch("/api/estado", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(function (res) {
        if (res.status === 401) throw new Error("nao_autenticado");
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      })
      .then(function (out) {
        var base = emptyData();
        if (out && out.data && typeof out.data === "object") {
          Object.keys(base).forEach(function (k) {
            if (out.data[k] !== undefined) base[k] = out.data[k];
          });
          // Mantém chaves extras vindas do servidor.
          Object.keys(out.data).forEach(function (k) {
            if (base[k] === undefined) base[k] = out.data[k];
          });
        }
        Gestao.data = base;
        _lastUpdatedAt = (out && out.updated_at) || null;
        Gestao._loaded = true;
        setSaveStatus("idle", "salvo automaticamente");
        return Gestao.data;
      });
  }

  // True se algum modal/backdrop estiver aberto (pausa o polling para
  // não sobrescrever enquanto o master edita).
  function modalAberto() {
    return !!document.querySelector(
      '.modal, .modal-backdrop, [role="dialog"], .backdrop, .is-open'
    );
  }

  // Polling leve: a cada SYNC_INTERVAL_MS, busca o estado; se mudou e
  // nenhum modal estiver aberto, atualiza e re-renderiza a aba ativa.
  function iniciarSync() {
    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = setInterval(function () {
      // Pausa enquanto há modal aberto OU enquanto há gravação pendente.
      if (modalAberto() || _backendSaveTimer) return;
      fetch("/api/estado", { cache: "no-store", credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (out) {
          if (!out || !out.updated_at) return;
          if (out.updated_at === _lastUpdatedAt) return; // sem mudança
          _lastUpdatedAt = out.updated_at;
          var base = emptyData();
          if (out.data && typeof out.data === "object") {
            Object.keys(base).forEach(function (k) {
              if (out.data[k] !== undefined) base[k] = out.data[k];
            });
            Object.keys(out.data).forEach(function (k) {
              if (base[k] === undefined) base[k] = out.data[k];
            });
          }
          Gestao.data = base;
          rerenderActive();
        })
        .catch(function () {
          /* falha de rede no polling é silenciosa */
        });
    }, SYNC_INTERVAL_MS);
  }

  // Rótulos amigáveis dos perfis (badge no cabeçalho).
  var ROLE_LABELS = {
    master: "Mestre",
    viewer: "Visualização",
    governanca: "Governança",
    conteudo: "Conteúdo",
    experiencia: "Experiência"
  };

  // Mostra/atualiza o badge do perfil logado ao lado do save-status.
  function mostrarBadgeRole(role) {
    var label = ROLE_LABELS[role] || role;
    var badge = document.getElementById("role-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "role-badge";
      badge.style.cssText =
        "display:inline-flex;align-items:center;padding:3px 10px;" +
        "border-radius:999px;font-size:12px;font-weight:700;" +
        "background:#36177B;color:#fff;white-space:nowrap;";
      var anchor = document.getElementById("save-status");
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(badge, anchor);
      } else {
        document.body.appendChild(badge);
      }
    }
    badge.textContent = label;
    badge.title =
      role === "master"
        ? "Perfil mestre: edita todas as seções"
        : role === "viewer"
        ? "Perfil de visualização: somente leitura"
        : "Perfil " + label + ": edita apenas as seções do seu tema";
  }

  // Aplica a role no estado do app e ajusta UI dependente.
  // edita: array de chaves editáveis (perfis de área) ou null (master).
  function aplicarRole(role, edita) {
    Gestao.role = role;
    Gestao.areaKeys = Array.isArray(edita) ? edita : null;
    Gestao.readonly = role === "viewer";
    if (Gestao.readonly) {
      document.body.classList.add("is-viewer");
    } else {
      document.body.classList.remove("is-viewer");
    }
    // Importar substitui o estado inteiro — visível só para o master.
    var btnImport = document.getElementById("btn-import");
    if (btnImport) btnImport.style.display = role === "master" ? "" : "none";
    // Sair vale para qualquer perfil autenticado (só o backend tem sessão).
    var btnLogout = document.getElementById("btn-logout");
    if (btnLogout) btnLogout.hidden = false;
    mostrarBadgeRole(role);
  }

  // Sobe o app no modo backend: já carrega, renderiza e inicia o sync.
  function entrarBackend(role, edita) {
    aplicarRole(role, edita);
    carregarEstadoBackend()
      .then(function () {
        Gestao.showTab(DEFAULT_TAB);
        iniciarSync();
      })
      .catch(function (err) {
        console.error("Falha ao carregar estado do servidor:", err);
        // Se a sessão caiu, volta ao login.
        if (err && err.message === "nao_autenticado") {
          startBackendLogin();
        } else {
          setSaveStatus("error", "erro ao carregar");
        }
      });
  }

  // Encerra a sessão: grava o que estiver pendente, derruba o cookie no
  // servidor, limpa o espelho local e recarrega (o boot cai no login).
  function fazerLogout() {
    var btn = document.getElementById("btn-logout");
    if (btn) btn.disabled = true;

    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
    }
    setSaveStatus("saving", "saindo…");

    // Um save em debounce ainda não enviado se perderia no reload.
    return flushSaveBackend()
      .catch(function () {
        /* falha de gravação já reportada — ainda assim encerra a sessão */
      })
      .then(function () {
        return fetch("/api/logout", {
          method: "POST",
          credentials: "same-origin"
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        // No modo backend o localStorage é só espelho, e guarda dados da
        // área restrita: some com ele antes de liberar a máquina.
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
          /* storage indisponível: nada a limpar */
        }
        window.location.reload();
      })
      .catch(function (err) {
        console.error("Falha ao encerrar a sessão:", err);
        setSaveStatus("error", "erro ao sair");
        if (btn) btn.disabled = false;
        iniciarSync(); // a sessão continua viva: retoma o polling
      });
  }

  // Tela de login do modo backend (reusa o visual do gate).
  function startBackendLogin() {
    var g = buildGate({
      subtitle:
        "Área restrita. Informe a senha para acessar as informações."
    });
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

      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ senha: senha })
      })
        .then(function (res) {
          if (res.status === 401) throw new Error("senha");
          if (!res.ok) throw new Error("rede");
          return res.json();
        })
        .then(function (out) {
          // Sucesso: remove o login e libera o app conforme a role.
          g.overlay.parentNode &&
            g.overlay.parentNode.removeChild(g.overlay);
          entrarBackend((out && out.role) || "viewer", out && out.edita);
        })
        .catch(function (err) {
          g.btn.disabled = false;
          g.msg.style.color = "#E0611F";
          if (err && err.message === "senha") {
            g.msg.textContent = "Senha incorreta. Tente novamente.";
            g.input.select();
          } else {
            g.msg.textContent =
              "Não foi possível conectar ao servidor. Tente novamente.";
          }
        });
    });
  }

  /* ============================================================
     Bootstrap
     ------------------------------------------------------------
     Decide o modo em runtime:
     - /api/ping responde  -> MODO BACKEND (login + Postgres).
     - /api/ping falha      -> MODO VAULT (estático, fallback).
     ============================================================ */
  function boot() {
    wireUI();
    setSaveStatus("saving", "bloqueado");

    detectarBackend().then(function (temBackend) {
      if (temBackend) {
        Gestao.mode = "backend";
        // Se já houver sessão válida, pula o login.
        fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (out) {
            if (out && out.role) {
              entrarBackend(out.role, out.edita);
            } else {
              startBackendLogin();
            }
          })
          .catch(function () {
            startBackendLogin();
          });
        return;
      }

      // MODO VAULT (comportamento estático original — intacto).
      Gestao.mode = "vault";
      startGate(function (decrypted) {
        Gestao.load(decrypted).then(function () {
          Gestao.showTab(DEFAULT_TAB);
        });
      });
    });
  }

  /* ============================================================
     Utilitários globais — consumidos por todos os módulos
     ============================================================ */

  Gestao.toast = function (msg, type, ms) {
    type = type || "success";
    ms = ms === undefined ? 3000 : ms;
    var c = document.getElementById("gestao-toasts");
    if (!c) {
      c = document.createElement("div"); c.id = "gestao-toasts";
      document.body.appendChild(c);
    }
    var t = document.createElement("div");
    t.className = "gestao-toast gestao-toast--" + type;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-visible"); });
    setTimeout(function () {
      t.classList.remove("is-visible");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
    }, ms);
  };

  Gestao.confirm = function (msg, onYes, labelYes) {
    labelYes = labelYes || "Excluir";
    var bd = document.createElement("div");
    bd.className = "gestao-confirm-backdrop";
    var box = document.createElement("div"); box.className = "gestao-confirm-box";
    var p = document.createElement("p"); p.className = "gestao-confirm-msg"; p.textContent = msg;
    var btns = document.createElement("div"); btns.className = "gestao-confirm-btns";
    var no = document.createElement("button"); no.className = "btn"; no.textContent = "Cancelar"; no.type = "button";
    var yes = document.createElement("button"); yes.className = "btn btn-danger"; yes.textContent = labelYes; yes.type = "button";
    btns.appendChild(no); btns.appendChild(yes);
    box.appendChild(p); box.appendChild(btns); bd.appendChild(box); document.body.appendChild(bd);
    function close() { if (bd.parentNode) bd.parentNode.removeChild(bd); }
    no.addEventListener("click", close);
    bd.addEventListener("click", function (e) { if (e.target === bd) close(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
    yes.addEventListener("click", function () { close(); onYes(); });
    setTimeout(function () { no.focus(); }, 50);
  };

  Gestao.maskPhone = function (input) {
    if (!input || input._phoneMasked) return;
    input._phoneMasked = true;
    input.addEventListener("input", function () {
      var v = input.value.replace(/\D/g, "").slice(0, 11);
      if (v.length > 6)      input.value = "(" + v.slice(0,2) + ") " + v.slice(2,7) + "-" + v.slice(7);
      else if (v.length > 2) input.value = "(" + v.slice(0,2) + ") " + v.slice(2);
      else if (v.length > 0) input.value = "(" + v;
    });
  };

  Gestao.maskBRL = function (input) {
    if (!input || input._brlMasked) return;
    input._brlMasked = true;
    input.addEventListener("blur", function () {
      var raw = input.value.replace(/[R$\s.]/g, "").replace(",", ".");
      var n = parseFloat(raw);
      if (!isNaN(n) && n >= 0)
        input.value = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  };

  Gestao.addTooltip = function (labelEl, text) {
    var icon = document.createElement("span");
    icon.className = "tooltip-icon"; icon.setAttribute("title", text); icon.textContent = " ⓘ";
    labelEl.appendChild(icon);
  };

  Gestao.emptyState = function (msg, btnLabel, onBtnClick) {
    var wrap = document.createElement("div"); wrap.className = "empty-cta";
    var p = document.createElement("p"); p.textContent = msg; wrap.appendChild(p);
    if (btnLabel && onBtnClick && !Gestao.readonly) {
      var btn = document.createElement("button");
      btn.className = "btn btn-primary sm"; btn.type = "button"; btn.textContent = btnLabel;
      btn.addEventListener("click", onBtnClick); wrap.appendChild(btn);
    }
    return wrap;
  };

  // Expõe globalmente para os módulos.
  window.Gestao = Gestao;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ============================================================
   Tab-group dropdowns — toggle e active state
   Fora do IIFE principal para fazer patch em window.Gestao.showTab
   depois que ele é publicado.
   ============================================================ */
(function () {
  "use strict";

  function updateGroupActive(tabId) {
    document.querySelectorAll(".tab-group").forEach(function (group) {
      var btn = group.querySelector(".tab-group__btn");
      if (!btn) return;
      var hasTab = group.querySelector('[data-tab="' + tabId + '"]');
      if (hasTab) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
  }

  function closeAllMenus() {
    document.querySelectorAll(".tab-group__menu").forEach(function (m) {
      m.hidden = true;
    });
    document.querySelectorAll(".tab-group__btn").forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }

  function wireDropdowns() {
    document.querySelectorAll(".tab-group__btn").forEach(function (btn) {
      var group = btn.parentElement;
      var menu = group && group.querySelector(".tab-group__menu");
      if (!menu) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var opening = menu.hidden;
        closeAllMenus();
        if (opening) {
          menu.hidden = false;
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });

    document.querySelectorAll(".tab-group__menu .tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeAllMenus();
        updateGroupActive(btn.getAttribute("data-tab"));
      });
    });

    document.addEventListener("click", closeAllMenus);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllMenus();
    });

    if (window.Gestao) {
      var _orig = window.Gestao.showTab;
      window.Gestao.showTab = function (id) {
        _orig.call(this, id);
        updateGroupActive(id);
      };
      updateGroupActive("tab-visao");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDropdowns);
  } else {
    wireDropdowns();
  }
})();

/* ============================================================
   Dark mode + Font size + Back-to-top + Keyboard shortcuts
   UI-28, UI-29, UI-14, UI-13
   ============================================================ */
(function () {
  "use strict";

  var LS_THEME = "gestao_theme";

  /* ---- Dark mode ---- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t || "light");
    localStorage.setItem(LS_THEME, t || "light");
    var btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = t === "dark" ? "☀" : "🌙";
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  /* ---- Back-to-top ---- */
  function initBackTop() {
    var btn = document.createElement("button");
    btn.id = "btn-back-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "Voltar ao topo");
    btn.textContent = "↑";
    document.body.appendChild(btn);
    window.addEventListener("scroll", function () {
      if (window.scrollY > 300) btn.classList.add("is-visible");
      else btn.classList.remove("is-visible");
    }, { passive: true });
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /* ---- Keyboard shortcuts Alt+1..6 ---- */
  var TAB_SHORTCUTS = ["tab-visao", "tab-cronograma", "tab-financeiro", "tab-equipe", "tab-reunioes", "tab-relatorios"];

  function initKeyShortcuts() {
    document.addEventListener("keydown", function (e) {
      if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= TAB_SHORTCUTS.length) {
        e.preventDefault();
        if (window.Gestao && window.Gestao.showTab) window.Gestao.showTab(TAB_SHORTCUTS[n - 1]);
      }
    });
  }

  function init() {
    /* Restaurar preferências salvas */
    var savedTheme = localStorage.getItem(LS_THEME);
    if (savedTheme) applyTheme(savedTheme);

    /* Botão dark mode */
    var btnTheme = document.getElementById("btn-theme");
    if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

    initBackTop();
    initKeyShortcuts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
