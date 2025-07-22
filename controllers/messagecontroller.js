import fs from 'fs';
import path from 'path';

// Obtener __dirname en ES Modules
const __dirname = path.resolve();

export const renderMessageCenter = (req, res) => {
  try {
    // LOGS REMOVIDOS
    const data = { 
      user: req.user,
      videoPath: '/users/message-center/upholding-gti-standards'
    };
    res.render('message-center', data);
  } catch (error) {
    // LOGS REMOVIDOS
    res.status(500).render('error', { 
      message: 'Error interno del servidor',
      error
    });
  }
};

export const downloadVideo = (req, res) => {
  try {
    // LOGS REMOVIDOS
    
    // 1. Definir ruta ABSOLUTA del video (misma ruta que en streamVideo)
    const videoPath = 'D:\\Trabajo\\Programacion\\GOLDENTRUST\\intranet2\\intranet2\\assets\\videos\\message1.mp4';
    
    // 2. Verificar existencia del archivo
    if (!fs.existsSync(videoPath)) {
      // LOGS REMOVIDOS
      return res.status(404).send('Video no encontrado');
    }

    // 3. Obtener nombre del archivo para la descarga
    const filename = path.basename(videoPath);
    
    // 4. Configurar headers para forzar descarga
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    // 5. Crear stream y manejar errores
    const videoStream = fs.createReadStream(videoPath);
    
    videoStream.on('error', (error) => {
      // LOGS REMOVIDOS
      if (!res.headersSent) {
        res.status(500).send('Error en el servidor');
      }
    });

    // 6. Enviar el archivo
    videoStream.pipe(res);
    // LOGS REMOVIDOS

  } catch (error) {
    // LOGS REMOVIDOS
    if (!res.headersSent) {
      res.status(500).send('Error interno del servidor');
    }
  }
};

export const streamVideo = (req, res) => {
  try {
    // LOGS REMOVIDOS
    
    // 1. Definir ruta ABSOLUTA del video (usa tu ruta específica)
    const videoPath = 'D:\\Trabajo\\Programacion\\GOLDENTRUST\\intranet2\\intranet2\\assets\\videos\\message1.mp4';
    
    // 2. Verificar existencia del archivo
    // LOGS REMOVIDOS
    if (!fs.existsSync(videoPath)) {
      // LOGS REMOVIDOS
      return res.status(404).send('Video no encontrado');
    }
    // LOGS REMOVIDOS

    // 3. Obtener estadísticas del video
    const videoStats = fs.statSync(videoPath);
    const videoSize = videoStats.size;
    // LOGS REMOVIDOS

    // 4. Manejar solicitudes sin cabecera Range
    if (!req.headers.range) {
      // LOGS REMOVIDOS
      const headers = {
        "Content-Length": videoSize,
        "Content-Type": "video/mp4"
      };
      res.writeHead(200, headers);
      return fs.createReadStream(videoPath).pipe(res);
    }

    // 5. Parsear cabecera Range
    const range = req.headers.range;
    // LOGS REMOVIDOS
    
    const CHUNK_SIZE = 10 ** 6; // 1MB
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
    const contentLength = end - start + 1;
    
    // LOGS REMOVIDOS

    // 6. Configurar headers
    const headers = {
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": "video/mp4"
    };

    // 7. Enviar respuesta parcial
    res.writeHead(206, headers);
    
    // 8. Crear stream de video
    const videoStream = fs.createReadStream(videoPath, { 
      start, 
      end 
    });
    
    // 9. Manejar errores del stream
    videoStream.on('error', (error) => {
      // LOGS REMOVIDOS
      if (!res.headersSent) {
        res.status(500).send('Error en el servidor');
      }
    });
    

    // 10. Pipe al response
    videoStream.pipe(res);
    
    // LOGS REMOVIDOS
    
  } catch (error) {
    // LOGS REMOVIDOS
    if (!res.headersSent) {
      res.status(500).send('Error interno del servidor');
    }
  }
};