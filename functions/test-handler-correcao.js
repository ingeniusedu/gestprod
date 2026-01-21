// Teste da correção do handler para kit atendendo grupo de modelo
console.log('=== TESTE HANDLER CORREÇÃO ===\n');

// Simulação da função corrigida
function simularAplicarModificacoes(grupo, modificacoes) {
  console.log(`Processando grupo ${grupo.id} (${grupo.targetProductType})`);
  
  const updatedGrupo = { ...grupo };
  const modificacao = modificacoes[0];
  const { campo, valor } = modificacao;
  
  if (campo === 'atendimentoDetalhado') {
    const { origem, quantidade, produtoRaizId, produtoRaizTipo } = valor;
    console.log(`Adicionando atendimentoDetalhado: origem=${origem}, quantidade=${quantidade}, produtoRaizTipo=${produtoRaizTipo}`);
    
    const novoAtendimento = {
      origem: origem,
      quantidade: quantidade,
      timestamp: new Date().toISOString()
    };
    
    const targetProductType = grupo.targetProductType;
    
    // 1. GRUPO DE MODELO: Atender todas as pecasNecessarias
    if (targetProductType === 'modelo' && grupo.pecasNecessarias) {
      console.log(`Grupo é modelo, atendendo todas as ${grupo.pecasNecessarias.length} peças`);
      const updatedPecas = grupo.pecasNecessarias.map(peca => {
        // Adicionar atendimento em TODAS as peças
        if (!peca.atendimentoDetalhado) peca.atendimentoDetalhado = [];
        peca.atendimentoDetalhado.push(novoAtendimento);
        return peca;
      });
      updatedGrupo.pecasNecessarias = updatedPecas;
    }
    
    // 2. GRUPO DE PEÇA: Atender todas as partesNecessarias
    else if (targetProductType === 'peca' && grupo.partesNecessarias) {
      console.log(`Grupo é peça, atendendo todas as ${grupo.partesNecessarias.length} partes`);
      const updatedPartes = grupo.partesNecessarias.map(parte => {
        if (!parte.atendimentoDetalhado) parte.atendimentoDetalhado = [];
        parte.atendimentoDetalhado.push(novoAtendimento);
        return parte;
      });
      updatedGrupo.partesNecessarias = updatedPartes;
    }
    
    // 3. GRUPO DE KIT: Atender pecasNecessarias e/ou modelosNecessarios
    else if (targetProductType === 'kit') {
      console.log(`Grupo é kit`);
      
      if (grupo.pecasNecessarias) {
        console.log(`Atendendo ${grupo.pecasNecessarias.length} peças do kit`);
        const updatedPecas = grupo.pecasNecessarias.map(peca => {
          if (!peca.atendimentoDetalhado) peca.atendimentoDetalhado = [];
          peca.atendimentoDetalhado.push(novoAtendimento);
          return peca;
        });
        updatedGrupo.pecasNecessarias = updatedPecas;
      }
      
      if (grupo.modelosNecessarios) {
        console.log(`Atendendo ${grupo.modelosNecessarios.length} modelos do kit`);
        const updatedModelos = grupo.modelosNecessarios.map(modelo => {
          if (!modelo.atendimentoDetalhado) modelo.atendimentoDetalhado = [];
          modelo.atendimentoDetalhado.push(novoAtendimento);
          return modelo;
        });
        updatedGrupo.modelosNecessarios = updatedModelos;
      }
    }
  }
  
  // Verificar se grupo está completamente atendido
  function verificarGrupoCompletamenteAtendido(grupo) {
    if (grupo.pecasNecessarias && grupo.pecasNecessarias.length > 0) {
      const todasPecasAtendidas = grupo.pecasNecessarias.every(peca => {
        const totalAtendido = peca.atendimentoDetalhado?.reduce(
          (sum, item) => sum + item.quantidade, 0
        ) || 0;
        return totalAtendido >= peca.quantidade;
      });
      if (!todasPecasAtendidas) return false;
    }
    return true;
  }
  
  const grupoCompletamenteAtendido = verificarGrupoCompletamenteAtendido(updatedGrupo);
  if (grupoCompletamenteAtendido) {
    updatedGrupo.status = 'concluido_por_estoque';
    console.log(`Grupo completamente atendido, status atualizado para 'concluido_por_estoque'`);
  }
  
  return updatedGrupo;
}

// Cenário: Grupo de modelo (como mostrado pelo usuário)
const grupoModelo = {
  id: 'IhCgpYL9PnL8fQfVDUWR',
  targetProductType: 'modelo',
  targetProductId: 'eeoEZhH6N449BiLKtwyp',
  status: 'aguardando_montagem',
  pecasNecessarias: [
    {
      pecaId: '63I1fKBSglotHXh1ndqq',
      nome: 'Simples',
      quantidade: 1,
      atendimentoDetalhado: []
    },
    {
      pecaId: 'SzKhXq8tiCWUimE06ycE',
      nome: 'Composta Multi Grupos',
      quantidade: 1,
      atendimentoDetalhado: []
    },
    {
      pecaId: 'Wg686mPj77M8dqFrfSei',
      nome: 'Compsota Um grupo sem montagem',
      quantidade: 1,
      atendimentoDetalhado: []
    },
    {
      pecaId: 'yfj5JP3F32SQP9HcEoHV',
      nome: 'Composta Um grupo Com montagem',
      quantidade: 1,
      atendimentoDetalhado: []
    }
  ]
};

const modificacoes = [{
  campo: 'atendimentoDetalhado',
  valor: {
    origem: 'estoque_kit',
    quantidade: 1,
    produtoRaizId: 'lab8UHknYyzgUYlbhxxF',
    produtoRaizTipo: 'kit'
  }
}];

console.log('Grupo antes da atualização:');
console.log(JSON.stringify(grupoModelo, null, 2));

const grupoAtualizado = simularAplicarModificacoes(grupoModelo, modificacoes);

console.log('\nGrupo após atualização:');
console.log(JSON.stringify(grupoAtualizado, null, 2));

// Verificação
console.log('\n=== VERIFICAÇÃO ===');
console.log(`Status: ${grupoAtualizado.status}`);
console.log(`Pecas atendidas: ${grupoAtualizado.pecasNecessarias.length}`);

let todasAtendidas = true;
grupoAtualizado.pecasNecessarias.forEach((peca, i) => {
  const totalAtendido = peca.atendimentoDetalhado?.reduce((sum, item) => sum + item.quantidade, 0) || 0;
  console.log(`Peça ${i+1} (${peca.nome}): quantidade=${peca.quantidade}, atendido=${totalAtendido}`);
  if (totalAtendido < peca.quantidade) {
    todasAtendidas = false;
  }
});

if (todasAtendidas && grupoAtualizado.status === 'concluido_por_estoque') {
  console.log('\n✓ TESTE PASSOU: Grupo de modelo completamente atendido por kit!');
} else {
  console.log('\n✗ TESTE FALHOU: Grupo não está completamente atendido.');
}

console.log('\n=== TESTE CONCLUÍDO ===');
