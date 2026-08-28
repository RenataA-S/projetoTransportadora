// ==========================================================================
// INICIALIZAÇÃO DO FIREBASE (v9+ ES Modules via CDN)
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, 
  query, where, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { analisarPesagem, gerarResumoOperacional } from "./ai-assistant.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXGqn85J6RDkpNCr-_z31MM4LPhROg6zI",
  authDomain: "projetotransportadora-828a3.firebaseapp.com",
  projectId: "projetotransportadora-828a3",
  storageBucket: "projetotransportadora-828a3.firebasestorage.app",
  messagingSenderId: "845742289661",
  appId: "1:845742289661:web:8a834f453215330560c494"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let operacaoAtualId = null;
let html5QrScanner = null;

// ==========================================================================
// MÓDULO DE AUTENTICAÇÃO
// ==========================================================================

window.realizarLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erroDiv = document.getElementById('login-erro');

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    window.location.href = "index.html";
  } catch (error) {
    if (erroDiv) {
      erroDiv.textContent = "Erro de autenticação: " + error.message;
      erroDiv.classList.remove('hidden');
    } else {
      alert("Erro ao efetuar login: " + error.message);
    }
  }
};

onAuthStateChanged(auth, async (user) => {
  const btnLoginNav = document.getElementById('btn-login-nav');
  
  if (user) {
    if (btnLoginNav) {
      btnLoginNav.textContent = `Sair (${user.email})`;
      btnLoginNav.onclick = (e) => {
        e.preventDefault();
        signOut(auth);
      };
    }

    try {
      const userDoc = await getDoc(doc(db, "usuarios", user.uid));
      const isAdmin = userDoc.exists() && userDoc.data().perfil === "ADMINISTRADOR";

      document.querySelectorAll('.nav-menu a').forEach(link => {
        const href = link.getAttribute('href');
        if (['balanca-entrada.html', 'carregamento.html', 'balanca-saida.html', 'administrativo.html'].includes(href)) {
          link.style.display = isAdmin ? 'inline-block' : 'none';
        }
      });
    } catch (err) {
      console.error("Erro ao verificar perfil do usuário:", err);
    }
  } else {
    if (btnLoginNav) {
      btnLoginNav.textContent = "Login";
      btnLoginNav.onclick = null;
      btnLoginNav.setAttribute('href', 'login.html');
    }
    
    document.querySelectorAll('.nav-menu a').forEach(link => {
      const href = link.getAttribute('href');
      if (['balanca-entrada.html', 'carregamento.html', 'balanca-saida.html', 'administrativo.html'].includes(href)) {
        link.style.display = 'none';
      }
    });
  }
});

function gerarNumeroOperacao() {
  const agora = new Date();
  const dataStr = agora.toISOString().slice(0,10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `OP-${dataStr}-${rand}`;
}

// ==========================================================================
// MÓDULO 1: ENTRADA E REDIRECIONAMENTO PARA A BALANÇA DE ENTRADA
// ==========================================================================

window.cadastrarEntrada = async function() {
  try {
    const elPlaca = document.getElementById('placa');
    const elTipo = document.getElementById('tipoVeiculo');
    const elMot = document.getElementById('motorista') || document.getElementById('nomeMotorista');
    const elCpfMot = document.getElementById('cpfMotorista');
    const elOperacao = document.getElementById('operacao');
    
    if (!elPlaca || !elTipo || !elMot || !elCpfMot) {
      return alert("Erro: Campos obrigatórios do formulário não encontrados.");
    }

    const placa = elPlaca.value.toUpperCase().trim();
    const tipoVeiculo = elTipo.value;
    const nomeMotorista = elMot.value.trim();
    const cpfMotorista = elCpfMot.value.trim();
    const operacaoTipo = elOperacao ? elOperacao.value : "Carregamento";

    const nomeAjudante = document.getElementById('ajudante')?.value.trim() || "";
    const cpfAjudante = document.getElementById('cpfAjudante')?.value.trim() || "";
    const possuiAjudante = Boolean(nomeAjudante);

    const numOP = gerarNumeroOperacao();

    const novaOperacao = {
      numeroOperacao: numOP,
      placa: placa,
      tipoVeiculo: tipoVeiculo,
      operacao: operacaoTipo,
      motorista: { nome: nomeMotorista, cpf: cpfMotorista },
      nomeMotorista: nomeMotorista,
      cpfMotorista: cpfMotorista,
      ajudante: { possui: possuiAjudante, nome: nomeAjudante, cpf: cpfAjudante },
      status: "ENTRADA_REGISTRADA",
      auditoria: {
        criadoEm: serverTimestamp(),
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO"
      }
    };

    const docRef = await addDoc(collection(db, "operacoes"), novaOperacao);
    await registrarLog(docRef.id, "CADASTRO_ENTRADA", "Veículo registrado na portaria");

    // Redireciona diretamente para a Balança de Entrada passando a OP na URL
    window.location.href = `balanca-entrada.html?op=${numOP}`;

  } catch (err) {
    alert("Falha ao registrar entrada: " + err.message);
  }
};

// ==========================================================================
// MÓDULO 2: CONSULTAS DE OPERAÇÃO
// ==========================================================================

window.iniciarLeitorQRCode = function(elementId, destino) {
  if (typeof Html5QrcodeScanner !== "undefined") {
    html5QrScanner = new Html5QrcodeScanner(elementId, { fps: 10, qrbox: 250 });
    html5QrScanner.render((qrCodeMessage) => {
      html5QrScanner.clear();
      processarOPLocalizada(qrCodeMessage, destino);
    }, (error) => {});
  } else {
    alert("Biblioteca do scanner QR Code não carregada nesta página.");
  }
};

window.buscarOperacaoManual = function(destino) {
  let fieldId = destino === 'ENTRADA' ? 'busca-op' : (destino === 'CARREGAMENTO' ? 'busca-op-carregamento' : 'busca-op-saida');
  const elField = document.getElementById(fieldId);
  if (!elField) return alert("Campo de busca não encontrado.");

  const opValue = elField.value.trim();
  if(!opValue) return alert("Digite o número da operação");
  processarOPLocalizada(opValue, destino);
};

async function processarOPLocalizada(qrCodeMessage, modulo) {
  try {
    let numeroOP = qrCodeMessage.trim();
    
    if (numeroOP.startsWith("{") && numeroOP.endsWith("}")) {
      try {
        const parsed = JSON.parse(numeroOP);
        if (parsed.op) numeroOP = parsed.op;
      } catch (e) {}
    }

    if (numeroOP.includes("\n")) {
      numeroOP = numeroOP.split("\n")[0].replace(/^OP:\s*/i, "").trim();
    } else if (numeroOP.toLowerCase().startsWith("op:")) {
      numeroOP = numeroOP.replace(/^OP:\s*/i, "").trim();
    }

    const q = query(collection(db, "operacoes"), where("numeroOperacao", "==", numeroOP));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return alert("Operação não localizada no Firestore.");
    }

    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    operacaoAtualId = docSnap.id;

    let nomeMot = data.motorista?.nome || data.nomeMotorista || "N/A";
    let cpfMot = data.motorista?.cpf || data.cpfMotorista || "N/A";

    if (modulo === 'ENTRADA') {
      if (document.getElementById('read-op')) document.getElementById('read-op').innerText = data.numeroOperacao;
      if (document.getElementById('read-placa')) document.getElementById('read-placa').innerText = data.placa;
      if (document.getElementById('read-motorista')) document.getElementById('read-motorista').innerText = nomeMot;
      if (document.getElementById('read-cpf')) document.getElementById('read-cpf').innerText = cpfMot;
      if (document.getElementById('read-ajudante')) {
        document.getElementById('read-ajudante').innerText = (data.ajudante && data.ajudante.possui) ? data.ajudante.nome : "N/A";
      }
      if (document.getElementById('read-status')) document.getElementById('read-status').innerText = data.status;
      
      document.getElementById('detalhes-operacao')?.classList.remove('hidden');
      
      // Dá foco no campo de digitação do peso de entrada
      setTimeout(() => {
        const inputPeso = document.getElementById('pesoEntrada');
        if (inputPeso) inputPeso.focus();
      }, 200);

    } else if (modulo === 'CARREGAMENTO') {
      if (document.getElementById('carr-op')) document.getElementById('carr-op').innerText = data.numeroOperacao;
      if (document.getElementById('carr-placa')) document.getElementById('carr-placa').innerText = data.placa;
      if (document.getElementById('carr-peso')) document.getElementById('carr-peso').innerText = data.pesagemEntrada ? data.pesagemEntrada.pesoKg : "0";
      document.getElementById('secao-processo-carregamento')?.classList.remove('hidden');
    } else if (modulo === 'SAIDA') {
      if (document.getElementById('saida-op')) document.getElementById('saida-op').innerText = data.numeroOperacao;
      if (document.getElementById('saida-placa')) document.getElementById('saida-placa').innerText = data.placa;
      if (document.getElementById('saida-motorista')) document.getElementById('saida-motorista').innerText = nomeMot;
      if (document.getElementById('saida-peso-entrada')) document.getElementById('saida-peso-entrada').innerText = data.pesagemEntrada ? data.pesagemEntrada.pesoKg : "0";
      if (document.getElementById('saida-conferente')) document.getElementById('saida-conferente').innerText = data.conferencia ? data.conferencia.conferente : "N/A";
      document.getElementById('painel-saida')?.classList.remove('hidden');
      
      calcularLiquidoDinamico();
    }
  } catch (e) {
    alert("Erro ao consultar registro: " + e.message);
  }
}

// ==========================================================================
// MÓDULO 3: PESAGEM E FLUXO DE ETAPAS
// ==========================================================================

window.registrarPesoEntrada = async function() {
  const elPeso = document.getElementById('pesoEntrada');
  const peso = elPeso && elPeso.value !== "" ? parseFloat(elPeso.value) : 0;

  // Permite entrada zerada (0 kg) para caminhões vazios que irão carregar
  if (isNaN(peso) || peso < 0) return alert("Informe um peso válido!");

  try {
    const ref = doc(db, "operacoes", operacaoAtualId);
    await updateDoc(ref, {
      pesagemEntrada: {
        pesoKg: peso,
        dataHora: serverTimestamp(),
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO"
      },
      status: "BALANCA_ENTRADA_REALIZADA"
    });
    await registrarLog(operacaoAtualId, "PESAGEM_ENTRADA", `Peso registrado: ${peso}kg`);
    
    alert("Pesagem de Entrada registrada com sucesso! Redirecionando para Carregamento...");
    
    const opNumero = document.getElementById('read-op')?.innerText;
    if (opNumero) {
      window.location.href = `carregamento.html?op=${opNumero}`;
    } else {
      window.location.reload();
    }
  } catch(e) { 
    alert("Erro ao salvar: " + e.message); 
  }
};

window.processarSaida = async function() {
  const pesoSaida = parseFloat(document.getElementById('pesoSaida').value);
  const pesoEnt = parseFloat(document.getElementById('saida-peso-entrada').innerText) || 0;
  const pesoLiquido = Math.abs(pesoEnt - pesoSaida);

  if (isNaN(pesoSaida) || pesoSaida <= 0) {
    return alert("Informe um peso de saída válido.");
  }

  try {
    const ref = doc(db, "operacoes", operacaoAtualId);
    await updateDoc(ref, {
      pesagemSaida: {
        pesoKg: pesoSaida,
        pesoLiquidoKg: pesoLiquido,
        dataHora: serverTimestamp(),
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO"
      },
      status: "CONCLUIDO"
    });
    await registrarLog(operacaoAtualId, "ENCERRAMENTO", `Operação Concluída. Peso Líq: ${pesoLiquido}kg`);
    
    alert("Operação concluída com sucesso! Redirecionando para a página inicial...");
    
    // Redireciona para o início do fluxo (index.html)
    window.location.href = "index.html";
  } catch(e) { 
    alert("Erro no encerramento: " + e.message); 
  }
};

window.calcularLiquidoDinamico = function() {
  const pesoSaida = parseFloat(document.getElementById('pesoSaida')?.value) || 0;
  const pesoEntrada = parseFloat(document.getElementById('saida-peso-entrada')?.innerText) || 0;
  const display = document.getElementById('display-peso-liquido');
  const alerta = document.getElementById('alerta-validacao-peso');

  const analise = analisarPesagem(pesoEntrada, pesoSaida);

  if (display) {
    display.innerText = `${analise.pesoLiquido.toFixed(2)} kg`;
  }

  if (alerta) {
    if (analise.alerta) {
      alerta.innerText = analise.alerta;
      alerta.classList.remove('hidden');
    } else {
      alerta.classList.add('hidden');
    }
  }
};

// ==========================================================================
// MÓDULO 4: PAINEL ADMINISTRATIVO & AUDITORIA
// ==========================================================================

window.carregarHistoricoOperacoes = async function() {
  const tbody = document.getElementById('tbody-historico');
  if (!tbody) return;
  tbody.innerHTML = "";

  try {
    const q = query(collection(db, "operacoes"), orderBy("auditoria.criadoEm", "desc"));
    const snapshot = await getDocs(q);

    const listaOperacoes = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      listaOperacoes.push(data);

      const nomeMot = typeof data.motorista === 'object' ? data.motorista.nome : (data.nomeMotorista || data.motorista);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${data.numeroOperacao || '-'}</td>
        <td>${data.placa || '-'}</td>
        <td>${nomeMot || '-'}</td>
        <td>${data.auditoria?.criadoEm ? new Date(data.auditoria.criadoEm.toDate()).toLocaleString() : '-'}</td>
        <td>${data.pesagemEntrada ? data.pesagemEntrada.pesoKg + ' kg' : '-'}</td>
        <td>${data.pesagemSaida ? data.pesagemSaida.pesoKg + ' kg' : '-'}</td>
        <td>${data.pesagemSaida ? data.pesagemSaida.pesoLiquidoKg + ' kg' : '-'}</td>
        <td><span class="badge">${data.status}</span></td>
        <td><button class="btn btn-danger" onclick="cancelarOperacao('${docSnap.id}')">Cancelar</button></td>
      `;
      tbody.appendChild(tr);
    });

    const resumo = gerarResumoOperacional(listaOperacoes);

    if (document.getElementById('stat-patio')) document.getElementById('stat-patio').innerText = resumo.totalPatio;
    if (document.getElementById('stat-carregando')) document.getElementById('stat-carregando').innerText = resumo.emCarregamento;
    if (document.getElementById('stat-finalizados')) document.getElementById('stat-finalizados').innerText = resumo.concluidosHoje;
    if (document.getElementById('stat-peso-total')) document.getElementById('stat-peso-total').innerText = `${resumo.entradaPesoTotalKg.toFixed(2)} kg`;

  } catch(e) { 
    console.error("Erro ao carregar histórico:", e);
  }
};

window.cancelarOperacao = async function(id) {
  const motivo = prompt("Motivo do cancelamento administrativo:");
  if(!motivo) return;

  try {
    await updateDoc(doc(db, "operacoes", id), {
      status: "CANCELADO",
      motivoCancelamento: motivo
    });
    await registrarLog(id, "CANCELAMENTO", `Motivo: ${motivo}`);
    alert("Operação Cancelada!");
    carregarHistoricoOperacoes();
  } catch(e) { alert("Erro ao cancelar: " + e.message); }
};

async function registrarLog(opId, acao, detalhes) {
  try {
    await addDoc(collection(db, "logs"), {
      operacaoId: opId,
      acao: acao,
      detalhes: detalhes,
      timestamp: serverTimestamp(),
      usuarioUid: auth.currentUser ? auth.currentUser.uid : "SISTEMA"
    });
  } catch(e) { console.error("Erro ao gravar log", e); }
}

if(document.getElementById('tbody-historico')) {
  carregarHistoricoOperacoes();
}

// ==========================================================================
// DETECÇÃO AUTOMÁTICA DE OP VIA PARÂMETROS DE URL (Balança / Carregamento)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const opParam = urlParams.get("op");

  if (opParam) {
    if (window.location.pathname.includes("balanca-entrada.html")) {
      const inputBusca = document.getElementById("busca-op");
      if (inputBusca) {
        inputBusca.value = opParam;
        setTimeout(() => { processarOPLocalizada(opParam, "ENTRADA"); }, 300);
      }
    } else if (window.location.pathname.includes("carregamento.html")) {
      const inputBusca = document.getElementById("busca-op-carregamento");
      if (inputBusca) {
        inputBusca.value = opParam;
        setTimeout(() => { processarOPLocalizada(opParam, "CARREGAMENTO"); }, 300);
      }
    } else if (window.location.pathname.includes("balanca-saida.html")) {
      const inputBusca = document.getElementById("busca-op-saida");
      if (inputBusca) {
        inputBusca.value = opParam;
        setTimeout(() => { processarOPLocalizada(opParam, "SAIDA"); }, 300);
      }
    }
  }
});
// ==========================================================================
// CONTROLE DE DOCA - CARREGAMENTO E DESCARGA
// ==========================================================================

/**
 * Inicia o processo na doca alternando a exibição das fases
 */
export function iniciarEtapaCarregamento() {
  const tipoOp = document.getElementById("tipoOperacao").value;
  const faseInicio = document.getElementById("fase-inicio");
  const faseFim = document.getElementById("fase-fim");
  const tituloFaseFim = document.getElementById("titulo-fase-fim");

  if (faseInicio && faseFim) {
    // Esconde a fase de seleção e exibe o formulário de finalização
    faseInicio.classList.add("hidden");
    faseFim.classList.remove("hidden");

    if (tituloFaseFim) {
      tituloFaseFim.innerText = tipoOp === "DESCARGA" 
        ? "Conferência e Finalização de Descarga" 
        : "Conferência e Finalização de Carregamento";
    }
  } else {
    console.error("Elementos de controle de fase não encontrados no DOM.");
  }
}

/**
 * Conclui a conferência na doca e libera o veículo para a balança de saída
 */
export function finalizarEtapaCarregamento() {
  const conferente = document.getElementById("nomeConferente").value.trim();
  const tipoOp = document.getElementById("tipoOperacao").value;

  if (!conferente) {
    alert("Por favor, informe o nome do conferente responsável.");
    return;
  }

  const opAtual = document.getElementById("carr-op")?.innerText || "";
  const acaoTexto = tipoOp === "DESCARGA" ? "Descarga" : "Carregamento";

  alert(`Processo de ${acaoTexto} concluído com sucesso para a OP ${opAtual}!\nVeículo liberado para a Balança de Saída.`);

  // Redireciona para a balança de saída
  window.location.href = `balanca-saida.html?op=${encodeURIComponent(opAtual)}`;
}

// Expõe as funções para o manipulador inline onclick dos botões HTML
window.iniciarEtapaCarregamento = iniciarEtapaCarregamento;
window.finalizarEtapaCarregamento = finalizarEtapaCarregamento;