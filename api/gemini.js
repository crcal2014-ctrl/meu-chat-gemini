// Importa a biblioteca do Google
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Pega a chave da API das "Environment Variables" da Vercel (forma segura)
const apiKey = process.env.GEMINI_API_KEY;

// Inicializa o cliente do Gemini
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Esta é a função que a Vercel irá executar
export default async function handler(req, res) {
  // Apenas permite requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Nenhum prompt fornecido." });
  }

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Envia a resposta de volta para o front-end
    res.status(200).json({ text: text });
  } catch (error) {
    console.error("Erro ao chamar a API do Gemini:", error);
    res.status(500).json({ error: "Falha ao gerar resposta." });
  }
}