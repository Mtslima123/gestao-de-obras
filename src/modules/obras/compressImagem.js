// Redução das imagens antes de guardar/enviar (fotos da galeria, capa da obra). Saiu do ObraDetail.jsx
// para a conta das dimensões poder ser testada e a função ser conferida fora da tela de obra.

// Fotos da galeria: lado maior em 2048 px, JPEG 0,85. Antes era 1200 px de LARGURA e 0,82: a foto
// deitada de celular (4032x3024) saía em 1200x900, pouco para dar zoom ou sair no ZIP. Não passar muito
// disso: a foto de 2048 px pesa mais, e ela fica guardada no aparelho (fila sem internet) até subir,
// onde o espaço já acabou antes (ver mensagemDeFalhaAoGuardar). O teto de 5 MB do ObraDetail continua.
export const FOTO_LADO_MAIOR = 2048;
export const FOTO_QUALIDADE = 0.85;

// Tamanho da imagem reduzida. `pelo` escolhe qual medida o `limite` controla:
//  - 'largura' (padrão, como sempre foi): só a largura. Miniatura e capa seguem assim, para não mudarem.
//  - 'maior-lado': o maior entre largura e altura. Foto em pé e foto deitada saem com a mesma nitidez.
// Nunca amplia: imagem menor que o limite fica como está.
export function dimensoesDaReducao(largura, altura, limite, pelo = 'largura') {
  const referencia = pelo === 'maior-lado' ? Math.max(largura, altura) : largura;
  const escala = Math.min(1, limite / referencia);
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

// Aceita File ou Blob (a miniatura sai do blob já reduzido). Rejeita em vez de ficar
// pendurada: arquivo que não decodifica deixava o botão em "Salvando…" pra sempre.
export function compressImagem(file, limite = 1200, quality = 0.82, pelo = 'largura') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('falha ao ler a imagem'));
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('imagem inválida'));
      img.onload = () => {
        const { largura, altura } = dimensoesDaReducao(img.width, img.height, limite, pelo);
        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('falha ao comprimir a imagem'))), 'image/jpeg', quality);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
