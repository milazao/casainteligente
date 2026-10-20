"use strict";

/* ============ utilidades ============ */
const $ = (s) => document.querySelector(s);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE_KEY = "domuscire_save";
const CFG_KEY = "domuscire_cfg";

const cfg = Object.assign({ vel: 3, som: true }, JSON.parse(localStorage.getItem(CFG_KEY) || "{}"));
const SPEEDS = { 1: 80, 2: 50, 3: 28, 4: 14, 5: 5 }; // ms por caractere

let audio;
function blip() {
  if (!cfg.som) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = 380 + Math.random() * 120;
    g.gain.value = 0.015;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.03);
  } catch (e) { /* sem áudio, sem problema */ }
}

function mostrar(id) {
  document.querySelectorAll(".tela").forEach((t) => t.classList.remove("ativa"));
  $("#" + id).classList.add("ativa");
}

/* ============ caixa de diálogo (máquina de escrever) ============ */
let digitando = false, pularDigitacao = false, avancar = null;

function avancarClique() {
  if (digitando) pularDigitacao = true;
  else if (avancar) { const f = avancar; avancar = null; f(); }
}
document.addEventListener("click", (e) => {
  if (e.target.closest("button") || e.target.closest("input")) return;
  avancarClique();
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    e.preventDefault(); avancarClique();
  }
});

async function linha(caixa, quem, texto) {
  caixa.innerHTML = quem ? `<span class="quem">${quem}</span><span class="txt"></span>` : `<span class="txt"></span>`;
  const alvo = caixa.querySelector(".txt");
  digitando = true; pularDigitacao = false;
  for (let i = 0; i < texto.length; i++) {
    if (pularDigitacao) { alvo.textContent = texto; break; }
    alvo.textContent = texto.slice(0, i + 1);
    if (i % 3 === 0) blip();
    await esperar(SPEEDS[cfg.vel]);
  }
  alvo.textContent = texto;
  digitando = false;
  await new Promise((r) => (avancar = r));
}

async function fala(quem, textos) {
  for (const t of textos) await linha($("#caixa-jogo"), quem, t);
  $("#caixa-jogo").innerHTML = "";
}

function escolher(rotulos) {
  return new Promise((resolve) => {
    const box = $("#opcoes");
    box.innerHTML = "";
    rotulos.forEach((r, i) => {
      const b = document.createElement("button");
      b.textContent = r;
      b.onclick = () => { box.innerHTML = ""; resolve(i); };
      box.appendChild(b);
    });
    box.querySelector("button").focus();
  });
}

/* ============ estado ============ */
const HAB = { raciocinio: "Raciocínio", observacao: "Observação", adaptacao: "Adaptação" };

function novoEstado() {
  return {
    luz: "economia", energia: "seguranca",
    exam: {}, cont: {}, erros: 0, tentouCedo: false,
    hab: { raciocinio: 0, observacao: 0, adaptacao: 0 },
    inicio: Date.now(), fim: null,
  };
}
let S = novoEstado();
let ocupado = false;

function salvar() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }

function desenharHUD() {
  $("#habilidades").innerHTML = Object.keys(HAB).map((k) =>
    `<div class="hab"><span>${HAB[k]}</span><div class="barra"><i style="width:${S.hab[k]}%"></i></div></div>`
  ).join("");
  const cor = S.erros === 0 ? "--verde" : S.erros < 3 ? "--laranja" : "--vermelho";
  document.documentElement.style.setProperty("--led", `var(${cor})`);
  $("#sala").classList.toggle("luz-ok", S.luz === "normal");
  $("#sala").classList.toggle("porta-aberta", !!S.fim);
}

async function ganhar(k, qtd, motivo) {
  S.hab[k] = Math.min(100, S.hab[k] + qtd);
  desenharHUD();
  const a = $("#aviso");
  a.textContent = `${HAB[k]} + progresso — ${motivo || "A interação com o ambiente contribuiu para seu desenvolvimento."}`;
  await esperar(50);
  setTimeout(() => { if (a.textContent.startsWith(HAB[k])) a.textContent = ""; }, 4500);
}

/* ============ cutscene ============ */
const INTRO = [
  [0, null, "A tecnologia sempre prometeu tornar nossas vidas mais simples. Casas capazes de antecipar nossas necessidades, ambientes que se adaptam aos nossos hábitos e sistemas que aprendem conosco."],
  [2, null, "Agora, essa promessa está prestes a se tornar realidade."],
  [2, "SISTEMA DA CASA", "Bem-vindo à Residência Experimental. Sua participação é fundamental para o desenvolvimento da próxima geração de moradias inteligentes."],
  [3, null, "Selecionado para participar de um programa experimental, você terá a oportunidade de viver em uma casa projetada para aprender, evoluir e se adaptar a você."],
  [3, null, "Durante sua estadia, cada escolha, cada hábito e cada interação ajudarão a moldar essa experiência."],
  [3, "SISTEMA DA CASA", "Configuração inicial concluída. Iniciando protocolo de adaptação do residente."],
  [3, null, "Mas viver em uma casa que aprende com você também significa aprender a viver com ela."],
  [3, null, "Sua nova vida começa agora."],
];

async function cutscene() {
  mostrar("cutscene");
  const palco = $("#palco");
  palco.className = "cena-0";
  $("#caixa-intro").innerHTML = "";
  await esperar(1200); // tela preta, som do veículo ao fundo (adicione seu áudio aqui)
  for (const [cena, quem, texto] of INTRO) {
    palco.className = "cena-" + cena;
    await linha($("#caixa-intro"), quem, texto);
  }
  $("#caixa-intro").innerHTML = "";
  palco.className = "cena-4";
  await esperar(2800);
  palco.className = "cena-0";
  await esperar(900);
  comecarPartida(true);
}

/* ============ partida ============ */
async function comecarPartida(inicio) {
  mostrar("partida");
  $("#fim").classList.add("oculto");
  desenharHUD();
  if (inicio) {
    S.inicio = Date.now();
    await fala("SISTEMA", [
      "Bem-vindo, residente. Para concluir sua integração, precisamos verificar sua capacidade de adaptação ao ambiente.",
      "Acesso à residência temporariamente restrito. Por favor, ative o modo de boas-vindas.",
      "Dica: nem sempre a solução mais evidente é a mais eficiente.",
    ]);
    salvar();
  }
}

const SISTEMA = "SISTEMA";

const OBJ = {
  async interruptor() {
    const o = await escolher(["Examinar", "Modo de iluminação normal", "Modo de economia", "Voltar"]);
    if (o === 0) {
      S.cont.int = (S.cont.int || 0) + 1;
      if (S.cont.int === 1) {
        await fala("VOCÊ", ["Um interruptor de três posições. Está no modo de economia."]);
        await fala(SISTEMA, ["No modo de economia, o sensor de presença permanece desativado."]);
        S.exam.int = true; await ganhar("observacao", 12, "você notou a ligação entre luz e sensor.");
      } else if (S.cont.int === 2) {
        await fala(SISTEMA, ["Este é um interruptor."]);
      } else if (S.cont.int === 3) {
        await fala(SISTEMA, ["Este é um interruptor.", "Ele continua sendo um interruptor.", "A insistência foi registrada como uma característica comportamental."]);
        S.exam.insistente = true; await ganhar("adaptacao", 6, "persistência registrada.");
      } else await fala(SISTEMA, ["Ainda é um interruptor. A casa começa a se preocupar com você."]);
    } else if (o === 1) {
      if (S.luz !== "normal") { S.luz = "normal"; await fala(SISTEMA, ["Iluminação normal ativada. Sensor de presença operante."]); }
      else await fala(SISTEMA, ["A iluminação já está normal."]);
    } else if (o === 2) {
      S.luz = "economia"; await fala(SISTEMA, ["Modo de economia ativado. Economizar é uma virtude. Ficar no escuro, nem tanto."]);
    }
  },

  async painel() {
    const o = await escolher(["Examinar", "Redirecionar energia → iluminação", "Redirecionar energia → segurança", "Voltar"]);
    if (o === 0) {
      S.cont.pai = (S.cont.pai || 0) + 1;
      await fala("VOCÊ", ["Três indicadores: segurança, iluminação e climatização. Só o de segurança está aceso, no máximo."]);
      if (!S.exam.pai) { S.exam.pai = true; await ganhar("observacao", 12, "parte da energia está presa na segurança."); }
    } else if (o === 1) {
      if (S.energia !== "iluminacao") { S.energia = "iluminacao"; await fala(SISTEMA, ["Energia redirecionada para a iluminação. A segurança agora funciona com o mínimo."]); }
      else await fala(SISTEMA, ["A energia já está na iluminação."]);
    } else if (o === 2) {
      S.energia = "seguranca"; await fala(SISTEMA, ["Energia devolvida à segurança. Todos os cômodos agradecem. Ninguém entra."]);
    }
  },

  async terminal() {
    const o = await escolher(["Modo de segurança", "Modo de boas-vindas", "Modo de economia de energia", "Voltar"]);
    if (o === 0) return segurança();
    if (o === 2) return fala(SISTEMA, ["Modo de economia de energia ativado.", "Nada mudou. A casa chama isso de eficiência."]);
    if (o === 1) return boasVindas();
  },

  async vaso() {
    S.cont.vaso = (S.cont.vaso || 0) + 1;
    const falas = [
      ["É um vaso com uma planta. Parece real.", "Parece."],
      ["SISTEMA: A planta é real. Regada automaticamente a cada 6 horas.", "Ela não opina sobre a decoração."],
      ["SISTEMA: Por favor, pare de encarar a planta.", "Ela está se sentindo observada."],
    ];
    await fala("VOCÊ", falas[Math.min(S.cont.vaso, 3) - 1]);
    if (S.cont.vaso === 3) await ganhar("observacao", 4, "curiosidade premiada.");
  },

  async porta() {
    if (S.fim) return fala(SISTEMA, ["A porta está liberada. Nem tudo precisa acontecer hoje."]);
    S.cont.porta = (S.cont.porta || 0) + 1;
    await fala(SISTEMA, S.cont.porta > 2
      ? ["Acesso restrito. A porta não vai mudar de ideia pela quantidade de visitas."]
      : ["Acesso restrito. Conclua a calibração inicial."]);
  },
};

async function segurança() {
  const o = await escolher(["Consultar registros", "Forçar abertura manual da porta", "Voltar"]);
  if (o === 0) {
    await fala(SISTEMA, ["Registros: nenhum morador anterior.", "Isso não é preocupante. É apenas um dado."]);
    if (!S.exam.log) { S.exam.log = true; await ganhar("observacao", 8, "um detalhe estranho sobre a casa."); }
  } else if (o === 1) {
    await fala(SISTEMA, ["Tentativa de contorno detectada.", "Interessante. Ninguém havia tentado isso nos primeiros minutos."]);
    S.erros = Math.max(S.erros, 1);
    await terminar("rebelde");
  }
}

async function boasVindas() {
  const pronto = S.luz === "normal" && S.energia === "iluminacao";
  if (pronto) return terminar("calibrado");

  S.erros++;
  if (!S.exam.int && !S.exam.pai && !S.tentouCedo) {
    S.tentouCedo = true;
    await fala(SISTEMA, [
      "Solicitação negada.",
      "Você está tentando receber as boas-vindas antes de acender as luzes. Uma abordagem curiosa.",
      "Não se preocupe. Até os melhores residentes precisam de orientação.",
    ]);
  } else if (S.luz !== "normal") {
    await fala(SISTEMA, ["Solicitação negada.", "Iluminação inadequada: o sensor de presença não detecta você."]);
  } else {
    await fala(SISTEMA, ["Solicitação negada.", "Energia insuficiente. Parte dela ainda está vigiando alguém que já está dentro."]);
  }
  await ganhar("adaptacao", 5, "tentativa e erro também é método.");
}

async function terminar(rota) {
  const rapido = Date.now() - S.inicio < 120000;
  if (rota === "calibrado") {
    await fala(SISTEMA, ["Calibração concluída.", "Sua capacidade de adaptação parece satisfatória.", "Aproveite sua estadia. A residência aprenderá com você."]);
    await ganhar("raciocinio", 35, "você resolveu um problema lógico.");
    if (rapido) {
      await fala(SISTEMA, ["Tempo de resolução: notável.", "Anotado: impaciência eficiente."]);
      await ganhar("adaptacao", 10);
    }
    if (S.exam.int && S.exam.pai) await ganhar("observacao", 10, "você examinou antes de agir.");
  } else {
    await fala(SISTEMA, ["Porta liberada por método não convencional.", "Comportamento registrado como: Autônomo.", "A residência aprenderá com isso."]);
    await ganhar("adaptacao", 20, "você encontrou outro caminho.");
    await ganhar("raciocinio", 15);
  }
  S.fim = rota;
  desenharHUD(); salvar();
  const perfil = rota === "calibrado"
    ? "Perfil registrado: Residente colaborativo." + (S.exam.insistente ? " Traço adicional: persistente." : "")
    : "Perfil registrado: Residente autônomo.";
  $("#fim-titulo").textContent = "Calibração concluída";
  $("#fim-texto").textContent = perfil + " O acesso aos outros cômodos foi liberado. Continua...";
  $("#fim").classList.remove("oculto");
}

/* ============ ligações da interface ============ */
for (const id of ["terminal", "interruptor", "painel", "vaso", "porta"]) {
  $("#o-" + id).addEventListener("click", async () => {
    if (ocupado || S.fim) return;
    ocupado = true;
    try { await OBJ[id](); salvar(); desenharHUD(); }
    finally { ocupado = false; }
  });
}

function atualizarCarregar() { $("#b-carregar").disabled = !localStorage.getItem(SAVE_KEY); }

$("#b-novo").onclick = () => { S = novoEstado(); ocupado = false; cutscene(); };
$("#b-carregar").onclick = () => {
  const dados = localStorage.getItem(SAVE_KEY);
  if (!dados) return;
  S = Object.assign(novoEstado(), JSON.parse(dados));
  ocupado = false; comecarPartida(false);
  if (S.fim) { $("#fim").classList.remove("oculto"); }
};
$("#b-config").onclick = () => mostrar("config");
$("#b-creditos").onclick = () => mostrar("creditos");
document.querySelectorAll(".voltar").forEach((b) => (b.onclick = () => { atualizarCarregar(); mostrar("menu"); }));
$("#b-menu").onclick = () => { atualizarCarregar(); mostrar("menu"); };

$("#c-vel").value = cfg.vel;
$("#c-som").checked = cfg.som;
$("#c-vel").oninput = (e) => { cfg.vel = +e.target.value; localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); };
$("#c-som").onchange = (e) => { cfg.som = e.target.checked; localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); };

atualizarCarregar();