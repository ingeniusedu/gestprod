# Implementação: Sistema de Atualização de Custos via Pub/Sub

## Visão Geral
Implementamos um sistema de atualização de custos em cadeia usando Google Cloud Pub/Sub para resolver problemas de concorrência e garantir consistência nos cálculos de custo.

## Problema Original
Os triggers Firebase (`onWritePeca`, `onWriteModelo`, `onWriteKit`) causavam:
1. **Concorrência desnecessária**: Múltiplos triggers executando simultaneamente
2. **Inconsistências**: Cálculos desatualizados quando preços base mudavam
3. **Performance**: Recalcular toda a hierarquia a cada escrita

## Solução Implementada
Sistema baseado em Pub/Sub com 3 funções encadeadas:

### 1. **Fluxo de Atualização**
```
Filamento/Insumo/Serviço muda
        ↓
[Pub/Sub] → atualizacao-custo-pecas
        ↓
Recalcula TODAS as peças
        ↓
[Pub/Sub] → atualizacao-custo-modelos
        ↓
Recalcula TODOS os modelos
        ↓
[Pub/Sub] → atualizacao-custo-kits
        ↓
Recalcula TODOS os kits
```

### 2. **Funções Criadas**

#### Funções Pub/Sub
- **`atualizarPecasPubSub`**: Processa `atualizacao-custo-pecas`
- **`atualizarModelosPubSub`**: Processa `atualizacao-custo-modelos`
- **`atualizarKitsPubSub`**: Processa `atualizacao-custo-kits`

#### Triggers Modificados
- **`onUpdateGrupoDeFilamento`**: Detecta mudanças no custo médio ponderado
- **`onUpdateInsumo`**: Detecta mudanças no custo por unidade
- **`onUpdateServiceCosts`**: Detecta mudanças nos custos de serviço

#### Funções HTTP
- **`recalcularCustoProdutoHttp`**: Recálculo manual de produto específico
- **`iniciarAtualizacaoCompletaHttp`**: Inicia cadeia completa manualmente

### 3. **Triggers Removidos**
- `onWritePeca` ❌
- `onWriteModelo` ❌
- `onWriteKit` ❌

**Justificativa**: Cálculo já é feito no frontend, evitando concorrência desnecessária.

## Benefícios

### ✅ **Consistência Garantida**
- Atualização sequencial: peças → modelos → kits
- Sem concorrência entre cálculos

### ✅ **Performance Otimizada**
- Recalcula apenas quando preços base mudam
- Evita recálculos desnecessários a cada escrita

### ✅ **Manutenção Simplificada**
- Código centralizado em `calculoCustoUtils.ts`
- Fluxo claro e previsível
- Fácil depuração via logs

### ✅ **Controle Manual**
- Funções HTTP para recálculo específico
- Inicialização manual da cadeia completa

## Configuração Técnica

### Tópicos Pub/Sub
```javascript
const TOPICO_ATUALIZAR_PECAS = "atualizacao-custo-pecas";
const TOPICO_ATUALIZAR_MODELOS = "atualizacao-custo-modelos";
const TOPICO_ATUALIZAR_KITS = "atualizacao-custo-kits";
```

### Dependências
```json
{
  "@google-cloud/pubsub": "^4.0.0",
  "firebase-admin": "^12.6.0",
  "firebase-functions": "^7.0.0"
}
```

## Fluxo de Dados

### 1. **Trigger de Origem**
```javascript
// Exemplo: Filamento muda
await pubsubClient.topic(TOPICO_ATUALIZAR_PECAS).publishMessage({
  data: Buffer.from(JSON.stringify({
    tipo: "filamento",
    grupoFilamentoId: "grupo-123",
    timestamp: new Date().toISOString()
  }))
});
```

### 2. **Processamento em Cadeia**
```javascript
// Função 1: Atualiza peças
await recalcularTodasPecas();
await pubsubClient.topic(TOPICO_ATUALIZAR_MODELOS).publishMessage(...);

// Função 2: Atualiza modelos
await recalcularTodosModelos();
await pubsubClient.topic(TOPICO_ATUALIZAR_KITS).publishMessage(...);

// Função 3: Atualiza kits
await recalcularTodosKits();
```

## Próximos Passos

### 1. **Criação dos Tópicos no Google Cloud**
```bash
gcloud pubsub topics create atualizacao-custo-pecas
gcloud pubsub topics create atualizacao-custo-modelos
gcloud pubsub topics create atualizacao-custo-kits
```

### 2. **Deploy das Funções**
```bash
cd backend/functions
npm run build
firebase deploy --only functions
```

### 3. **Testes com Dados Reais**
- Alterar custo de um grupo de filamento
- Verificar logs do Cloud Functions
- Confirmar atualização em cascata

### 4. **Monitoramento**
- Configurar alertas para erros
- Monitorar tempo de execução
- Logs estruturados para depuração

## Códigos de Exemplo

### Teste Local
```bash
cd backend/functions
node test-pubsub-custo.js
```

### Recálculo Manual via HTTP
```bash
# Produto específico
curl "https://us-central1-gestprod-9c4ac.cloudfunctions.net/recalcularCustoProdutoHttp?produtoId=abc123&tipo=peca"

# Cadeia completa
curl -X POST https://us-central1-gestprod-9c4ac.cloudfunctions.net/iniciarAtualizacaoCompletaHttp
```

## Considerações de Segurança

### 1. **Autenticação**
- Funções HTTP requerem autenticação Firebase
- Pub/Sub usa IAM do Google Cloud

### 2. **Limites de Execução**
- Timeout: 540 segundos (máximo Cloud Functions)
- Memória: 2GB (configurável)

### 3. **Retry e Dead Letter**
- Pub/Sub retry automático
- Configurar dead letter topic para mensagens falhas

## Conclusão

A implementação resolve os problemas de concorrência e consistência através de:
1. **Separação de responsabilidades**: Cada função cuida de um nível da hierarquia
2. **Processamento sequencial**: Garante ordem correta dos cálculos
3. **Event-driven architecture**: Reage apenas a mudanças relevantes
4. **Controle granular**: Recálculo manual quando necessário

O sistema está pronto para produção após criação dos tópicos Pub/Sub e deploy das funções.
