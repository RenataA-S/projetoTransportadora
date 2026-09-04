import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBXGqn85J6RDkpNCr-_z31MM4LPhROg6zI",
  authDomain: "projetotransportadora-828a3.firebaseapp.com",
  projectId: "projetotransportadora-828a3",
  storageBucket: "projetotransportadora-828a3.firebasestorage.app",
  messagingSenderId: "845742289661",
  appId: "1:845742289661:web:8a834f453215330560c494"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

const COLECAO_ATENDIMENTOS = "atendimentos";

// Variáveis Globais de Controle de Estado
let atendimentoAtualId = null;
let html5QrScanner = null;
let meuGrafico = null;
let usuarioLogado = null;
let unsubscribeFila = null;
let historicoCompleto = [];

// ==========================================================================
// 2. MÁSCARAS E MÉTODOS UTILITÁRIOS
// ==========================================================================
function aplicarCapitalizacao(texto) {
  if (!texto) return '';
  return texto.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function aplicarMascaraCPF(valor) {
  if (!valor) return '';
  return valor.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
}

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('input-capitalizar')) {
    const pos = e.target.selectionStart;
    e.target.value = aplicarCapitalizacao(e.target.value);
    e.target.setSelectionRange(pos, pos);
  }
  if (e.target.classList.contains('input-cpf')) {
    e.target.value = aplicarMascaraCPF(e.target.value);
  }
});

function formatDateTime(timestamp) {
  if (!timestamp) return "--/--/---- --:--";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimeOnly(timestamp) {
  if (!timestamp) return "--:--";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function gerarAtendimentoId() {
  const d = new Date();
  const dataFormatada = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const aleatorio = String(Math.floor(Math.random() * 90000) + 10000);
  return `ATD-${dataFormatada}-${aleatorio}`;
}

// Extrai o código puro do QR Code, garantindo o correto isolamento do id mesmo com múltiplos parâmetros
function extrairCodigoQRCode(qrText) {
  if (!qrText) return "";
  if (qrText.includes("id=")) {
    const params = new URLSearchParams(qrText.includes("?") ? qrText.split("?")[1] : qrText);
    return params.get("id") || qrText.split("id=")[1].split("&")[0].trim();
  }
  return qrText.trim();
}

// ==========================================================================
// 3. NAVEGAÇÃO SPA
// ==========================================================================
window.navegarPara = function(idAba) {
  document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const abaAlvo = document.getElementById(idAba);
  if (abaAlvo) abaAlvo.classList.remove('hidden');

  const linkAtivo = Array.from(document.querySelectorAll('.nav-link')).find(a => a.getAttribute('onclick')?.includes(idAba));
  if (linkAtivo) linkAtivo.classList.add('active');

  window.pararCamera();

  if (idAba === 'aba-docas') {
    iniciarEscutaFilaETempoReal();
  } else if (idAba === 'aba-admin') {
    window.carregarHistoricoAtendimentos();
  }
};

// ==========================================================================
// 4. AUTENTICAÇÃO FIREBASE
// ==========================================================================
onAuthStateChanged(auth, (user) => {
  usuarioLogado = user;
  const navMenu = document.getElementById('nav-menu');
  if (!user) {
    if (navMenu) navMenu.style.display = 'none';
    window.navegarPara('aba-login');
  } else {
    if (navMenu) navMenu.style.display = 'flex';
    if (!document.getElementById('aba-login').classList.contains('hidden')) {
      window.navegarPara('aba-entrada');
    }
  }
});

window.fazerLogin = function(email, senha) {
  signInWithEmailAndPassword(auth, email, senha)
    .then(() => window.navegarPara('aba-entrada'))
    .catch((erro) => alert("Falha na autenticação: " + erro.message));
};

document.getElementById('btn-logout')?.addEventListener('click', () => {
  signOut(auth).then(() => window.navegarPara('aba-login'));
});

// ==========================================================================
// 5. ENTRADA DE VEÍCULOS & TICKET
// ==========================================================================
window.salvarEntrada = async function() {
  const placa = document.getElementById('placa-veiculo')?.value.toUpperCase().trim();
  const tipoVeiculo = document.getElementById('tipo-veiculo')?.value;
  const motorista = document.getElementById('nome-motorista')?.value.trim();
  const documentoMotorista = document.getElementById('cpf-motorista')?.value.trim();
  const ajudante = document.getElementById('nome-ajudante')?.value.trim();
  const documentoAjudante = document.getElementById('cpf-ajudante')?.value.trim();
  const telefone = document.getElementById('telefone-motorista')?.value.trim();
  const tipoOperacao = document.getElementById('tipo-operacao')?.value;
  const numeroOp = document.getElementById('numero-op')?.value.trim() || "N/A"; // Leitura do campo OP
  const numeroCarga = document.getElementById('numero-carga')?.value.trim();
  const transportadora = document.getElementById('transportadora')?.value.trim();
  const cliente = document.getElementById('cliente')?.value.trim();
  const observacao = document.getElementById('observacao')?.value.trim();

  if (!placa || !tipoVeiculo || !motorista || !documentoMotorista || !telefone || !numeroCarga || !transportadora || !cliente) {
    alert("Preencha todos os campos obrigatórios marcados com *.");
    return;
  }

  const idPersonalizado = gerarAtendimentoId();
  const agora = new Date();

  const dadosAtendimento = {
    atendimentoId: idPersonalizado,
    placa, tipoVeiculo, motorista, documentoMotorista, 
    ajudante: ajudante || "", documentoAjudante: documentoAjudante || "",
    telefone, transportadora, tipoOperacao, 
    numeroOp, // Persistido no documento
    numeroCarga, cliente,
    observacao: observacao || "",
    dataCadastro: agora.toISOString().slice(0, 10),
    horarioCadastro: formatTimeOnly(agora),
    horarioCheckin: null, horarioChamada: null, horarioChegadaDoca: null,
    horarioInicioOperacao: null, horarioFinalizacao: null, horarioSaida: null,
    doca: null, status: "CADASTRADO", usuarioChamada: null,
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  };

  try {
    await addDoc(collection(db, COLECAO_ATENDIMENTOS), dadosAtendimento);

    document.getElementById('ticket-id').innerText = idPersonalizado;
    document.getElementById('ticket-op').innerText = numeroOp;
    document.getElementById('ticket-placa').innerText = placa;
    document.getElementById('ticket-motorista').innerText = motorista;
    document.getElementById('ticket-ajudante').innerText = ajudante ? `${ajudante} (${documentoAjudante})` : 'Nenhum';
    document.getElementById('ticket-operacao').innerText = tipoOperacao;
    document.getElementById('ticket-carga').innerText = numeroCarga;
    document.getElementById('ticket-data').innerText = `${dadosAtendimento.dataCadastro} ${dadosAtendimento.horarioCadastro}`;

    // ALTERADO: URL apontando para a raiz em vez de /checkin
    const qrPayload = `https://projetotransportadora-828a3.web.app/?id=${idPersonalizado}&op=${encodeURIComponent(numeroOp)}&placa=${encodeURIComponent(placa)}`;
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
      qrContainer.innerHTML = "";
      if (typeof QRCode !== "undefined") new QRCode(qrContainer, { text: qrPayload, width: 160, height: 160 });
    }

    document.getElementById('area-ticket')?.classList.remove('hidden');
    document.getElementById('form-entrada')?.reset();
  } catch (erro) {
    console.error(erro);
    alert("Erro ao gravar cadastro no banco de dados.");
  }
};

window.imprimirTicketEntrada = function() {
  const ticketElement = document.getElementById('area-ticket');
  if (!ticketElement) return;

  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`
    <html><head><title>Ticket - Transportadora Paulão</title><style>body { font-family: monospace; text-align: center; padding: 20px; }</style></head>
    <body>${ticketElement.innerHTML}<script>window.onload = function() { window.print(); window.close(); };<\/script></body></html>
  `);
  win.document.close();
};

// ==========================================================================
// 6. LEITOR DE QR CODE DA CÂMERA & PROCESSAMENTO
// ==========================================================================
window.iniciarCamera = async function(elementId, callbackSucesso) {
  await window.pararCamera();
  const element = document.getElementById(elementId);
  if (element) element.classList.remove("hidden");

  try {
    html5QrScanner = new Html5Qrcode(elementId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    await html5QrScanner.start(
      { facingMode: { ideal: "environment" } },
      config,
      callbackSucesso,
      () => {}
    );
  } catch (err) { 
    alert("Erro ao acessar a câmera: " + err.message); 
  }
};

window.pararCamera = async function() {
  if (html5QrScanner) {
    try { 
      await html5QrScanner.stop(); 
    } catch (e) {}
    html5QrScanner.clear();
    html5QrScanner = null;
  }
};

window.habilitarScannerCheckin = function() {
  window.iniciarCamera("reader-checkin", async (qrMessage) => {
    await window.pararCamera();
    processarCheckinQRCode(qrMessage);
  });
};

async function processarCheckinQRCode(qrValue) {
  const alertBox = document.getElementById("checkin-alert");
  try {
    const atendimentoId = extrairCodigoQRCode(qrValue);
    const q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", atendimentoId));
    const snap = await getDocs(q);

    if (snap.empty) throw new Error(`Atendimento (${atendimentoId}) não foi encontrado.`);

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    if (data.status !== "CADASTRADO") {
      throw new Error(`Este veículo já está no status: ${data.status}`);
    }

    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, docSnap.id), {
      status: "AGUARDANDO_CHAMADA",
      horarioCheckin: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    document.getElementById('checkin-resumo-id').innerText = data.atendimentoId;
    document.getElementById('checkin-resumo-placa').innerText = data.placa;
    document.getElementById('checkin-resumo-motorista').innerText = data.motorista;

    document.getElementById('card-confirmacao-checkin')?.classList.remove('hidden');
    if (alertBox) alertBox.classList.add('hidden');
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = err.message;
      alertBox.className = "alert alert-danger";
      alertBox.classList.remove("hidden");
    }
  }
}

window.habilitarScannerDoca = function() {
  window.iniciarCamera("reader-doca", async (qrMessage) => {
    await window.pararCamera();
    const atendimentoId = extrairCodigoQRCode(qrMessage);

    const q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", atendimentoId));
    const snap = await getDocs(q);

    if (snap.empty) return alert(`Atendimento (${atendimentoId}) não encontrado.`);

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    if (data.status === "CHAMADO" || data.status === "A_CAMINHO_DA_DOCA") {
      await updateDoc(doc(db, COLECAO_ATENDIMENTOS, docSnap.id), {
        status: "NA_DOCA",
        horarioChegadaDoca: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      alert(`Veículo ${data.placa} chegou e foi confirmado na ${data.doca}! Status alterado para NA_DOCA.`);
    } else if (data.status === "NA_DOCA") {
      window.iniciarOperacaoDoca(docSnap.id);
      alert(`Iniciada a operação de carregamento/descarga para a placa ${data.placa}.`);
    } else if (data.status === "EM_OPERACAO") {
      window.finalizarOperacaoDoca(docSnap.id);
      alert(`Operação na doca finalizada para o veículo ${data.placa}. Encaminhado para a Balança.`);
    } else {
      alert(`O veículo está com status "${data.status}". Nenhuma ação automática executada.`);
    }
  });
};

// ==========================================================================
// 7. PAINEL DO LÍDER & DOCAS (TEMPO REAL)
// ==========================================================================
function iniciarEscutaFilaETempoReal() {
  if (unsubscribeFila) unsubscribeFila();

  const q = query(collection(db, COLECAO_ATENDIMENTOS));
  unsubscribeFila = onSnapshot(q, (snapshot) => {
    const todosAtendimentos = [];
    snapshot.forEach(docSnap => todosAtendimentos.push({ idFirestore: docSnap.id, ...docSnap.data() }));

    renderizarGridDocas(todosAtendimentos);
    renderizarFilaEspera(todosAtendimentos);
  });
}

function renderizarGridDocas(lista) {
  const gridContainer = document.getElementById('container-docas-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML = "";
  const docas = ["Doca 01", "Doca 02", "Doca 03", "Doca 04", "Doca 05", "Doca 06", "Doca 07", "Doca 08", "Doca 09", "Doca 10"];

  docas.forEach(nomeDoca => {
    const ocupante = lista.find(item => item.doca === nomeDoca && ["CHAMADO", "A_CAMINHO_DA_DOCA", "NA_DOCA", "EM_OPERACAO"].includes(item.status));

    const card = document.createElement('div');
    card.className = `doca-card ${ocupante ? 'ocupada' : 'livre'}`;

    if (!ocupante) {
      card.innerHTML = `
        <div class="doca-header"><strong>${nomeDoca}</strong><span class="doca-status-badge badge-livre">LIVRE</span></div>
        <p class="doca-info-vazio">Nenhum veículo alocado</p>
      `;
    } else {
      card.innerHTML = `
        <div class="doca-header"><strong>${nomeDoca}</strong><span class="doca-status-badge badge-ocupada">${ocupante.status}</span></div>
        <div class="doca-detalhes">
          <div><strong>Placa:</strong> ${ocupante.placa}</div>
          <div><strong>Motorista:</strong> ${ocupante.motorista}</div>
          <div><strong>Operação:</strong> ${ocupante.tipoOperacao}</div>
        </div>
        <div class="doca-acoes">
          ${ocupante.status === 'NA_DOCA' ? `<button class="btn btn-primary btn-sm" onclick="iniciarOperacaoDoca('${ocupante.idFirestore}')">Iniciar Operação</button>` : ''}
          ${ocupante.status === 'EM_OPERACAO' ? `<button class="btn btn-success btn-sm" onclick="finalizarOperacaoDoca('${ocupante.idFirestore}')">Finalizar Doca</button>` : ''}
        </div>
      `;
    }
    gridContainer.appendChild(card);
  });
}

function renderizarFilaEspera(lista) {
  const tbody = document.getElementById('tbody-fila-espera');
  if (!tbody) return;

  tbody.innerHTML = "";
  const fila = lista.filter(item => item.status === "AGUARDANDO_CHAMADA");

  if (fila.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nenhum veículo aguardando no pátio.</td></tr>`;
    return;
  }

  fila.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${index + 1}</strong></td>
      <td>${formatDateTime(item.horarioCheckin)}</td>
      <td>${item.atendimentoId}</td>
      <td><strong>${item.placa}</strong></td>
      <td>${item.motorista}</td>
      <td>${item.tipoOperacao}</td>
      <td>${item.transportadora}</td>
      <td><button class="btn btn-primary btn-sm" onclick="abrirModalChamar('${item.idFirestore}', '${item.placa}')">📢 CHAMAR VEÍCULO</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.abrirModalChamar = function(idFirestore, placa) {
  atendimentoAtualId = idFirestore;
  document.getElementById('modal-placa').innerText = placa;
  document.getElementById('modal-chamar-doca').classList.remove('hidden');
};

window.fecharModalChamar = function() {
  atendimentoAtualId = null;
  document.getElementById('modal-chamar-doca').classList.add('hidden');
};

window.confirmarChamadaDoca = async function() {
  if (!atendimentoAtualId) return;
  const docaSelecionada = document.getElementById('select-doca-chamar').value;

  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, atendimentoAtualId), {
      doca: docaSelecionada,
      status: "CHAMADO",
      usuarioChamada: usuarioLogado?.email || "Líder de Pátio",
      horarioChamada: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    alert(`Veículo chamado para a ${docaSelecionada}!`);
    window.fecharModalChamar();
  } catch (err) {
    alert("Erro ao realizar chamada para doca.");
  }
};

window.iniciarOperacaoDoca = async function(idFirestore) {
  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, idFirestore), {
      status: "EM_OPERACAO",
      horarioInicioOperacao: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  } catch (err) { alert("Erro ao iniciar operação."); }
};

window.finalizarOperacaoDoca = async function(idFirestore) {
  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, idFirestore), {
      status: "FINALIZADO",
      horarioFinalizacao: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  } catch (err) { alert("Erro ao finalizar doca."); }
};

// ==========================================================================
// 8. BALANÇA & SAÍDA
// ==========================================================================
window.buscarAtendimentoBalanca = async function() {
  const termo = document.getElementById('input-buscar-balanca')?.value.trim();
  if (!termo) return alert("Digite o ID ou Placa.");

  try {
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", termo));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", termo.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert("Nenhum atendimento localizado.");

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    atendimentoAtualId = docSnap.id;

    document.getElementById('bal-id').innerText = data.atendimentoId;
    document.getElementById('bal-placa').innerText = data.placa;
    document.getElementById('bal-motorista').innerText = data.motorista;
    document.getElementById('bal-ajudante').innerText = data.ajudante ? `${data.ajudante} (${data.documentoAjudante})` : 'Nenhum';
    document.getElementById('bal-operacao').innerText = data.tipoOperacao;
    document.getElementById('bal-doca').innerText = data.doca || 'N/A';
    document.getElementById('bal-status').innerText = data.status;

    document.getElementById('secao-liberacao-saida')?.classList.remove('hidden');
  } catch (err) { alert("Erro na busca."); }
};

window.confirmarSaidaBalança = async function() {
  if (!atendimentoAtualId) return;

  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, atendimentoAtualId), {
      status: "SAIDA_LIBERADA",
      horarioSaida: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    alert("Saída liberada com sucesso!");
    document.getElementById('secao-liberacao-saida')?.classList.add('hidden');
    document.getElementById('form-buscar-balanca')?.reset();
    atendimentoAtualId = null;
  } catch (err) { alert("Erro ao gravar saída."); }
};

// ==========================================================================
// 9. CONSULTA DE STATUS PÚBLICA
// ==========================================================================
window.consultarStatusPublico = async function() {
  const termo = document.getElementById('input-consulta-termo')?.value.trim();
  if (!termo) return alert("Informe o ID ou a Placa.");

  try {
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", termo));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", termo.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert("Nenhum registro encontrado.");

    const data = snap.docs[0].data();

    document.getElementById('cons-id').innerText = data.atendimentoId;
    document.getElementById('cons-placa').innerText = data.placa;
    document.getElementById('cons-motorista').innerText = data.motorista;
    document.getElementById('cons-ajudante').innerText = data.ajudante ? `${data.ajudante} (${data.documentoAjudante})` : 'Nenhum';
    document.getElementById('cons-operacao').innerText = data.tipoOperacao;
    document.getElementById('cons-doca').innerText = data.doca || 'Pátio / Não Alocado';
    document.getElementById('cons-status').innerText = data.status;
    document.getElementById('cons-data').innerText = formatDateTime(data.atualizadoEm || data.criadoEm);

    document.getElementById('secao-resultado-consulta')?.classList.remove('hidden');
  } catch (err) { alert("Erro ao consultar status."); }
};

// ==========================================================================
// 10. PAINEL ADMIN E HISTÓRICO
// ==========================================================================
window.carregarHistoricoAtendimentos = async function() {
  try {
    const snap = await getDocs(collection(db, COLECAO_ATENDIMENTOS));
    historicoCompleto = [];
    snap.forEach(d => historicoCompleto.push({ idFirestore: d.id, ...d.data() }));

    renderizarDashboardEAdmin(historicoCompleto);
  } catch (err) { console.error(err); }
};

document.getElementById('input-busca-admin')?.addEventListener('input', (e) => {
  const termo = e.target.value.toLowerCase().trim();
  if (!termo) {
    renderizarDashboardEAdmin(historicoCompleto);
    return;
  }

  const listaFiltrada = historicoCompleto.filter(item => {
    return (
      (item.atendimentoId && item.atendimentoId.toLowerCase().includes(termo)) ||
      (item.placa && item.placa.toLowerCase().includes(termo)) ||
      (item.motorista && item.motorista.toLowerCase().includes(termo)) ||
      (item.tipoOperacao && item.tipoOperacao.toLowerCase().includes(termo)) ||
      (item.status && item.status.toLowerCase().includes(termo)) ||
      (item.doca && item.doca.toLowerCase().includes(termo)) ||
      (item.numeroOp && item.numeroOp.toLowerCase().includes(termo))
    );
  });

  renderizarDashboardEAdmin(listaFiltrada);
});

document.getElementById('tipo-grafico-select')?.addEventListener('change', () => {
  renderizarDashboardEAdmin(historicoCompleto);
});

function renderizarDashboardEAdmin(lista) {
  let espera = 0, chamados = 0, doca = 0, finalizados = 0;
  let contagemOperacoes = {};

  const tbody = document.getElementById('tbody-historico');
  if (tbody) tbody.innerHTML = "";

  lista.forEach(item => {
    if (item.status === "AGUARDANDO_CHAMADA") espera++;
    if (["CHAMADO", "A_CAMINHO_DA_DOCA"].includes(item.status)) chamados++;
    if (["NA_DOCA", "EM_OPERACAO"].includes(item.status)) doca++;
    if (["FINALIZADO", "SAIDA_LIBERADA"].includes(item.status)) finalizados++;

    contagemOperacoes[item.tipoOperacao] = (contagemOperacoes[item.tipoOperacao] || 0) + 1;

    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.atendimentoId}</strong></td>
        <td>${item.placa}</td>
        <td>${item.motorista}</td>
        <td>${item.tipoOperacao}</td>
        <td>${item.doca || '-'}</td>
        <td>${item.dataCadastro} ${item.horarioCadastro}</td>
        <td><span class="badge-status status-${item.status}">${item.status}</span></td>
        <td style="text-align: center;"><button class="btn btn-outline btn-sm" onclick="imprimirAuditoriaAtendimento('${item.idFirestore}')">🖨️ Detalhes</button></td>
      `;
      tbody.appendChild(tr);
    }
  });

  document.getElementById('stat-espera').innerText = espera;
  document.getElementById('stat-chamados').innerText = chamados;
  document.getElementById('stat-doca').innerText = doca;
  document.getElementById('stat-finalizados').innerText = finalizados;

  renderizarGraficoAdmin(contagemOperacoes);
}

window.imprimirAuditoriaAtendimento = async function(idFirestore) {
  try {
    const docRef = doc(db, COLECAO_ATENDIMENTOS, idFirestore);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      alert("Atendimento não localizado.");
      return;
    }

    const data = docSnap.data();
    const win = window.open('', '_blank', 'width=600,height=700');
    win.document.write(`
      <html>
        <head>
          <title>Auditoria - ${data.atendimentoId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #2c3e50; }
            h2 { color: #0a3d62; border-bottom: 2px solid #0a3d62; padding-bottom: 8px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px #eee dashed; }
            .label { font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>TRANSPORTADORA PAULÃO - RELATÓRIO DE AUDITORIA</h2>
          <div class="row"><span class="label">ID Atendimento:</span><span>${data.atendimentoId}</span></div>
          <div class="row"><span class="label">Placa:</span><span>${data.placa}</span></div>
          <div class="row"><span class="label">Motorista:</span><span>${data.motorista} (${data.documentoMotorista})</span></div>
          <div class="row"><span class="label">Ajudante:</span><span>${data.ajudante ? `${data.ajudante} (${data.documentoAjudante})` : 'Nenhum'}</span></div>
          <div class="row"><span class="label">Telefone:</span><span>${data.telefone}</span></div>
          <div class="row"><span class="label">Tipo Veículo:</span><span>${data.tipoVeiculo}</span></div>
          <div class="row"><span class="label">Operação:</span><span>${data.tipoOperacao}</span></div>
          <div class="row"><span class="label">Nº OP:</span><span>${data.numeroOp || 'N/A'}</span></div>
          <div class="row"><span class="label">Nº Carga / NF:</span><span>${data.numeroCarga}</span></div>
          <div class="row"><span class="label">Transportadora:</span><span>${data.transportadora}</span></div>
          <div class="row"><span class="label">Cliente:</span><span>${data.cliente}</span></div>
          <div class="row"><span class="label">Doca Alocada:</span><span>${data.doca || 'N/A'}</span></div>
          <div class="row"><span class="label">Status Atual:</span><span>${data.status}</span></div>
          <div class="row"><span class="label">Cadastro:</span><span>${data.dataCadastro} às ${data.horarioCadastro}</span></div>
          <div class="row"><span class="label">Horário Check-in:</span><span>${formatDateTime(data.horarioCheckin)}</span></div>
          <div class="row"><span class="label">Horário Chamada:</span><span>${formatDateTime(data.horarioChamada)}</span></div>
          <div class="row"><span class="label">Horário Entrada Doca:</span><span>${formatDateTime(data.horarioChegadaDoca)}</span></div>
          <div class="row"><span class="label">Início Operação:</span><span>${formatDateTime(data.horarioInicioOperacao)}</span></div>
          <div class="row"><span class="label">Fim Operação:</span><span>${formatDateTime(data.horarioFinalizacao)}</span></div>
          <div class="row"><span class="label">Horário Saída:</span><span>${formatDateTime(data.horarioSaida)}</span></div>
          <div class="row"><span class="label">Observações:</span><span>${data.observacao || 'Nenhuma'}</span></div>
          <script>window.onload = function() { window.print(); };<\/script>
        </body>
      </html>
    `);
    win.document.close();
  } catch (err) {
    alert("Erro ao gerar relatório de detalhes: " + err.message);
  }
};

function renderizarGraficoAdmin(dados) {
  const ctx = document.getElementById('graficoOperacoes')?.getContext('2d');
  if (!ctx) return;

  if (meuGrafico) meuGrafico.destroy();

  meuGrafico = new Chart(ctx, {
    type: document.getElementById('tipo-grafico-select')?.value || 'bar',
    data: {
      labels: Object.keys(dados),
      datasets: [{ label: 'Quantidade por Operação', data: Object.values(dados), backgroundColor: '#0a3d62' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// ==========================================================================
// 11. AUTOLOAD DE CHECK-IN VIA URL (LEITURA DIRETA DO CELULAR)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const idViaUrl = urlParams.get('id');

  if (idViaUrl) {
    // Redireciona para a tela de Check-in
    window.navegarPara('aba-checkin');
    
    // Dispara a validação e alteração do status para AGUARDANDO_CHAMADA
    processarCheckinQRCode(idViaUrl);
  }
});