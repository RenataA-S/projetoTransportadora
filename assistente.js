// ==========================================================================
// MÓDULO ASSISTENTE IA - TRANSPORTADORA PAULÃO
// ==========================================================================

/**
 * Valida a pesagem única realizada exclusivamente na saída
 * @param {number} pesoSaida - Peso final em kg
 * @returns {object} Análise de validação
 */
export function analisarPesagem(pesoSaida) {
  let alerta = null;

  if (!pesoSaida || pesoSaida <= 0) {
    alerta = "ATENÇÃO: O peso registrado na saída deve ser maior que zero.";
  }

  return {
    pesoLiquido: Number(pesoSaida) || 0,
    alerta: alerta,
    statusValido: !alerta
  };
}

/**
 * Resume estatísticas do pátio para o painel gerencial
 * @param {Array} operacoes - Lista de operações vindas do Firestore
 */
export function gerarResumoOperacional(operacoes) {
  const resumo = {
    totalPatio: 0,
    emCarregamento: 0,
    concluidosHoje: 0
  };

  const hoje = new Date().toDateString();

  operacoes.forEach(op => {
    if (op.status === "ENTRADA_REGISTRADA") {
      resumo.totalPatio++;
    } else if (op.status === "EM_CARREGAMENTO" || op.status === "EM_DESCARGA") {
      resumo.emCarregamento++;
    }

    if (op.status === "CONCLUIDO") {
      const dataFim = op.pesagemSaida?.dataHora?.toDate?.()?.toDateString();
      if (dataFim === hoje) {
        resumo.concluidosHoje++;
      }
    }
  });

  return resumo;
}