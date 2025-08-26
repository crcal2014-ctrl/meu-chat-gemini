import { GoogleGenerativeAI } from '@google/generative-ai';
import { formidable } from 'formidable';
import fs from 'fs/promises'; // Para ler arquivos do sistema
import path from 'path'; // Para construir caminhos de arquivos
import pdf from 'pdf-parse'; // Para ler o conteúdo dos PDFs

// Configuração para Vercel entender uploads de arquivos
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- INÍCIO DA LÓGICA PRINCIPAL ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // 1. Processar o formulário com o arquivo enviado
    const { fields, files } = await parseForm(req);
    const instrucao = fields.instrucao?.[0] || 'Gerar o relatório, parecer e voto completo.';
    const processoFile = files.pdf?.[0];

    if (!processoFile) {
      return res.status(400).json({ error: 'Nenhum arquivo de processo foi enviado.' });
    }

    // 2. Extrair o texto do PDF do processo enviado pelo usuário
    const processoData = await fs.readFile(processoFile.filepath);
    const textoDoProcesso = (await pdf(processoData)).text;

    // 3. Carregar e extrair texto da base de conhecimento (seus PDFs de regras)
    const textoBaseConhecimento = await carregarBaseConhecimento();

    // 4. Montar o "Super-Prompt" para o Gemini
    const promptFinal = construirPrompt(instrucao, textoBaseConhecimento, textoDoProcesso);
    
    // 5. Chamar a API do Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use um modelo robusto para tarefas complexas

    const result = await model.generateContent(promptFinal);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ text: text });

  } catch (error) {
    console.error("Erro no processamento da requisição:", error);
    res.status(500).json({ error: `Falha ao gerar o documento: ${error.message}` });
  }
}


// --- FUNÇÕES AUXILIARES ---

// Função para processar o formulário de upload
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({});
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Função para carregar todos os PDFs da pasta 'knowledge'
async function carregarBaseConhecimento() {
  const knowledgeDir = path.resolve(process.cwd(), 'knowledge');
  const files = await fs.readdir(knowledgeDir);
  let fullText = '';

  for (const file of files) {
    if (path.extname(file).toLowerCase() === '.pdf') {
      const filePath = path.join(knowledgeDir, file);
      const data = await fs.readFile(filePath);
      const pdfText = (await pdf(data)).text;
      fullText += `\n\n--- INÍCIO DO DOCUMENTO: ${file} ---\n\n${pdfText}\n\n--- FIM DO DOCUMENTO: ${file} ---\n\n`;
    }
  }
  return fullText;
}

// Função para construir o prompt final
function construirPrompt(instrucao, textoBaseConhecimento, textoDoProcesso) {
  // O modelo do seu "Gem" vai aqui, como instrução principal.
  const modeloRelatorio = `
    Você é um assistente especialista em direito processual para o Conselho Regional de Contabilidade. Sua tarefa é gerar um relatório, parecer e voto com base em um processo administrativo, seguindo estritamente o modelo e as normas fornecidas.

    MODELO A SER SEGUIDO:
    ---
    CABEÇALHO
    Nº PROCESSO: [Extraia do processo]
    DATA DE ABERTURA: [Extraia do processo]
    FASE: [Extraia do processo]
    AUTUADO (A): [Extraia do processo]
    CATEGORIA: [Extraia do processo]
    Nº DE REGISTRO / ID: [Extraia do processo]
    PROCESSOS CORRELATOS: [Extraia do processo, se houver]
    ENQUADRAMENTO: [Determine com base na infração e nas normas]
    INFRAÇÃO: [Descreva a infração com base no processo]
    PENALIDADE PREVISTA: [Determine com base nas normas]

    I - RELATÓRIO
    Faça um breve histórico do processo (origem, documentos, autuação, defesa). Destaque a materialidade e a autoria. Resuma os argumentos da defesa.

    II - PARECER
    Confirme a materialidade e autoria da infração com base nos documentos do processo e nas normas fornecidas. Analise os argumentos da defesa, considerando dolo, culpa, boa-fé e primariedade. Relacione os fatos com o tipo infracional previsto na legislação.

    III - VOTO
    Apresente uma conclusão fundamentada. Indique claramente a decisão (ARQUIVAMENTO ou APLICAÇÃO DE PENALIDADE), especificando a multa e a penalidade ética, se aplicável, com base nas normas. Use linguagem formal e cite os fundamentos legais e normativos pertinentes.
    ---
  `;

  return `
    ${modeloRelatorio}

    INSTRUÇÃO ADICIONAL DO USUÁRIO:
    "${instrucao}"

    BASE DE CONHECIMENTO (LEIS, NORMAS E RESOLUÇÕES):
    ---
    ${textoBaseConhecimento}
    ---

    CONTEÚDO DO PROCESSO A SER ANALISADO:
    ---
    ${textoDoProcesso}
    ---

    Agora, gere o documento completo conforme solicitado.
  `;
}