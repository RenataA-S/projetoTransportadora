// ==========================================================================
// MÓDULO ASSISTENTE IA - TRANSPORTADORA Paulão
// ==========================================================================

/**
 * Analisa divergências de pesagem na balança de saída
 * @param {number} pesoEntrada - Peso inicial (kg)
 * @param {number} pesoSaida - Peso final (kg)
 * @returns {object} Análise de risco/alerta
 */
export function analisarPesagem(pesoEntrada, pesoSaida) {
  const liquido = Math.abs(pesoEntrada - pesoSaida);
  let alerta = null;

  // Se o peso de entrada é 0 (caminhão entra vazio para carregar), 
  // o peso de saída deve ser estritamente maior que zero.
  if (pesoEntrada === 0 && pesoSaida <= 0) {
    alerta = "ATENÇÃO: O caminhão entrou vazio (0 kg). O peso de saída deve ser maior que zero após o carregamento.";
  } 
  // Se o peso de entrada for maior que zero (operação padrão/descarga), 
  // valida se houve alteração coerente de peso.
  else if (pesoEntrada > 0 && pesoSaida === pesoEntrada) {
    alerta = "ATENÇÃO: O peso de saída é idêntico ao de entrada. Verifique se a pesagem foi realizada corretamente.";
  }

  return {
    pesoLiquido: liquido,
    alerta: alerta,
    statusValido: !alerta
  };
}

/**
 * Resume estatísticas do pátio para o painel gerencial
 * @param {Array} operacoes - Lista de operações do Firestore
 */
export function gerarResumoOperacional(operacoes) {
  const resumo = {
    totalPatio: 0,
    emCarregamento: 0,
    concluidosHoje: 0,
    entradaPesoTotalKg: 0
  };

  const hoje = new Date().toDateString();

  operacoes.forEach(op => {
    // Contagem de pátio e doca
    if (op.status === "ENTRADA_REGISTRADA" || op.status === "BALANCA_ENTRADA_REALIZADA") {
      resumo.totalPatio++;
    } else if (op.status === "EM_CARREGAMENTO" || op.status === "EM_DESCARGA") {
      resumo.emCarregamento++;
    }

    // Contagem de concluídos no dia
    if (op.status === "CONCLUIDO") {
      const dataFim = op.pesagemSaida?.dataHora?.toDate()?.toDateString();
      if (dataFim === hoje) resumo.concluidosHoje++;
    }

    // Cálculo do somatório total do Peso de Entrada das operações ativas ou concluídas no dia
    if (op.status !== "CANCELADO" && op.pesagemEntrada?.pesoKg) {
      const dataEntrada = op.pesagemEntrada?.dataHora?.toDate()?.toDateString();
      if (op.status !== "CONCLUIDO" || dataEntrada === hoje) {
        resumo.entradaPesoTotalKg += Number(op.pesagemEntrada.pesoKg);
      }
    }
  });

  return resumo;
}