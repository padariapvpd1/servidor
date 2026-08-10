const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ========================================
// MEMÓRIA DO SERVIDOR
// ========================================

const comandosPendentes = new Map();
const respostasDispositivos = new Map();
const dispositivos = new Map();


// ========================================
// BUSCAR ENDEREÇO
// ========================================

async function buscarEndereco(latitude, longitude) {

    const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}` +
        `&zoom=18` +
        `&addressdetails=1`;

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "ServidorAndroid/1.0"
        }
    });

    if (!resposta.ok) {
        throw new Error(
            `Nominatim respondeu HTTP ${resposta.status}`
        );
    }

    return await resposta.json();
}


// ========================================
// RECEBER / ATUALIZAR DISPOSITIVO
// ========================================

app.post("/api/device", async (req, res) => {

    try {

        const dados = req.body || {};

        let ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "Desconhecido";

        if (ip.includes(",")) {
            ip = ip.split(",")[0].trim();
        }

        ip = ip.replace("::ffff:", "");

        const deviceId =
            dados.deviceId || "celular-001";

        const dispositivoAtual = {
            deviceId,

            marca:
                dados.marca || "",

            fabricante:
                dados.fabricante || "",

            modelo:
                dados.modelo || "",

            android:
                dados.android || "",

            ip,

            latitude:
                dados.latitude ?? null,

            longitude:
                dados.longitude ?? null,

            bairro:
                dados.bairro || "",

            cidade:
                dados.cidade || "",

            estado:
                dados.estado || "",

            cep:
                dados.cep || "",

            pais:
                dados.pais || "",

            ultimoContato:
                new Date().toISOString()
        };

        dispositivos.set(
            deviceId,
            dispositivoAtual
        );

        console.log("");
        console.log("========================================");
        console.log("       DISPOSITIVO CONECTADO");
        console.log("========================================");
        console.log("ID:          ", deviceId);
        console.log("Marca:       ", dispositivoAtual.marca);
        console.log("Fabricante:  ", dispositivoAtual.fabricante);
        console.log("Modelo:      ", dispositivoAtual.modelo);
        console.log("Android:     ", dispositivoAtual.android);
        console.log("IP:          ", ip);
        console.log("Latitude:    ", dispositivoAtual.latitude);
        console.log("Longitude:   ", dispositivoAtual.longitude);
        console.log("Cidade:      ", dispositivoAtual.cidade);
        console.log("Estado:      ", dispositivoAtual.estado);
        console.log("========================================");
        console.log("");

        // Consulta adicional ao Nominatim,
        // caso o Android tenha enviado coordenadas.
        if (
            typeof dados.latitude === "number" &&
            typeof dados.longitude === "number"
        ) {

            try {

                const endereco =
                    await buscarEndereco(
                        dados.latitude,
                        dados.longitude
                    );

                const address =
                    endereco.address || {};

                const atual =
                    dispositivos.get(deviceId);

                if (atual) {

                    atual.bairro =
                        atual.bairro ||
                        address.suburb ||
                        address.neighbourhood ||
                        address.village ||
                        "";

                    atual.cidade =
                        atual.cidade ||
                        address.city ||
                        address.town ||
                        address.municipality ||
                        address.village ||
                        "";

                    atual.estado =
                        atual.estado ||
                        address.state ||
                        "";

                    atual.cep =
                        atual.cep ||
                        address.postcode ||
                        "";

                    atual.pais =
                        atual.pais ||
                        address.country ||
                        "";

                    atual.endereco =
                        endereco.display_name ||
                        "";

                    dispositivos.set(
                        deviceId,
                        atual
                    );
                }

            } catch (erro) {

                console.error(
                    "Erro ao consultar localização:",
                    erro.message
                );
            }
        }

        res.status(200).json({
            sucesso: true
        });

    } catch (erro) {

        console.error(
            "Erro ao processar dispositivo:",
            erro
        );

        res.status(500).json({
            sucesso: false
        });
    }
});


// ========================================
// ENVIAR COMANDO
// ========================================

app.post("/api/command", (req, res) => {

    const {
        deviceId,
        command
    } = req.body || {};

    if (!deviceId || !command) {

        return res.status(400).json({
            sucesso: false,
            erro:
                "deviceId e command são obrigatórios"
        });
    }

    // Comandos de diagnóstico permitidos.

    const comandosPermitidos = [
        "PING",
        "STATUS"
    ];

    if (
        !comandosPermitidos.includes(command)
    ) {

        return res.status(400).json({
            sucesso: false,
            erro:
                "Comando não permitido"
        });
    }

    if (
        !comandosPendentes.has(deviceId)
    ) {

        comandosPendentes.set(
            deviceId,
            []
        );
    }

    comandosPendentes
        .get(deviceId)
        .push({
            command,
            criadoEm:
                new Date().toISOString()
        });

    console.log("");
    console.log("========================================");
    console.log("          NOVO COMANDO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("Comando:    ", command);
    console.log("========================================");

    res.status(200).json({
        sucesso: true,
        mensagem:
            "Comando colocado na fila"
    });
});


// ========================================
// ANDROID BUSCA COMANDO
// ========================================

app.get(
    "/api/command/:deviceId",
    (req, res) => {

        const deviceId =
            req.params.deviceId;

        const fila =
            comandosPendentes.get(
                deviceId
            ) || [];

        if (fila.length === 0) {

            return res.status(200).json({
                sucesso: true,
                comando: null
            });
        }

        const comando =
            fila.shift();

        res.status(200).json({
            sucesso: true,
            comando
        });
    }
);


// ========================================
// RECEBER RESPOSTA DO ANDROID
// ========================================

app.post("/api/response", (req, res) => {

    const {
        deviceId,
        response
    } = req.body || {};

    if (!deviceId || !response) {

        return res.status(400).json({
            sucesso: false,
            erro:
                "deviceId e response são obrigatórios"
        });
    }

    const dadosResposta = {
        response,
        recebidoEm:
            new Date().toISOString()
    };

    respostasDispositivos.set(
        deviceId,
        dadosResposta
    );

    // Atualiza também o último contato.

    const dispositivo =
        dispositivos.get(deviceId);

    if (dispositivo) {

        dispositivo.ultimoContato =
            new Date().toISOString();

        dispositivos.set(
            deviceId,
            dispositivo
        );
    }

    console.log("");
    console.log("========================================");
    console.log("       RESPOSTA DO DISPOSITIVO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("Resposta:   ", response);
    console.log("========================================");
    console.log("");

    res.status(200).json({
        sucesso: true
    });
});


// ========================================
// LISTAR DISPOSITIVOS
// ========================================

app.get("/api/devices", (req, res) => {

    const lista =
        Array.from(
            dispositivos.values()
        ).map(dispositivo => {

            const ultimoContato =
                new Date(
                    dispositivo.ultimoContato
                );

            const agora =
                new Date();

            const segundos =
                (agora - ultimoContato) / 1000;

            return {
                ...dispositivo,

                status:
                    segundos <= 30
                        ? "ONLINE"
                        : "OFFLINE"
            };
        });

    res.json({
        sucesso: true,
        dispositivos: lista
    });
});


// ========================================
// BUSCAR ÚLTIMA RESPOSTA
// ========================================

app.get(
    "/api/response/:deviceId",
    (req, res) => {

        const resposta =
            respostasDispositivos.get(
                req.params.deviceId
            );

        res.json({
            sucesso: true,
            resposta: resposta || null
        });
    }
);


// ========================================
// PAINEL
// ========================================

app.get("/", (req, res) => {

    res.send(`

<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Controle do Dispositivo</title>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    background: #101010;

    color: white;

    font-family: Arial, sans-serif;
}

.container {

    max-width: 900px;

    margin: auto;

    padding: 30px;
}

h1 {

    text-align: center;

    margin-bottom: 30px;
}

.card {

    background: #1c1c1c;

    border-radius: 14px;

    padding: 22px;

    margin-bottom: 20px;

    box-shadow:
        0 5px 20px rgba(0,0,0,0.25);
}

.info {

    display: grid;

    grid-template-columns:
        repeat(auto-fit, minmax(220px, 1fr));

    gap: 12px;

    margin-top: 15px;
}

.item {

    background: #292929;

    padding: 12px;

    border-radius: 8px;
}

.label {

    color: #aaa;

    font-size: 13px;

}

.value {

    margin-top: 5px;

    font-size: 16px;

    word-break: break-word;
}

.status {

    font-size: 18px;

    font-weight: bold;

    margin-top: 10px;
}

button {

    padding: 13px 24px;

    margin: 6px;

    border: none;

    border-radius: 8px;

    background: #333;

    color: white;

    font-size: 16px;

    cursor: pointer;
}

button:hover {

    background: #444;
}

pre {

    background: #080808;

    border-radius: 8px;

    padding: 15px;

    min-height: 50px;

    white-space: pre-wrap;

    word-break: break-word;
}

.small {

    color: #999;

    font-size: 13px;
}

</style>

</head>


<body>

<div class="container">

<h1>
Painel do Dispositivo
</h1>


<div class="card">

<h2>
celular-001
</h2>

<div class="status">

Status:

<span id="status">
VERIFICANDO...
</span>

</div>

<div class="small"
id="ultimoContato">
Último contato: -
</div>

</div>


<div class="card">

<h2>
Informações
</h2>

<div class="info">

<div class="item">
<div class="label">Marca</div>
<div class="value" id="marca">-</div>
</div>

<div class="item">
<div class="label">Fabricante</div>
<div class="value" id="fabricante">-</div>
</div>

<div class="item">
<div class="label">Modelo</div>
<div class="value" id="modelo">-</div>
</div>

<div class="item">
<div class="label">Android</div>
<div class="value" id="android">-</div>
</div>

<div class="item">
<div class="label">IP</div>
<div class="value" id="ip">-</div>
</div>

<div class="item">
<div class="label">Cidade</div>
<div class="value" id="cidade">-</div>
</div>

<div class="item">
<div class="label">Estado</div>
<div class="value" id="estado">-</div>
</div>

<div class="item">
<div class="label">CEP</div>
<div class="value" id="cep">-</div>
</div>

<div class="item">
<div class="label">País</div>
<div class="value" id="pais">-</div>
</div>

<div class="item">
<div class="label">Latitude</div>
<div class="value" id="latitude">-</div>
</div>

<div class="item">
<div class="label">Longitude</div>
<div class="value" id="longitude">-</div>
</div>

<div class="item">
<div class="label">Endereço</div>
<div class="value" id="endereco">-</div>
</div>

</div>

</div>


<div class="card">

<h2>
Comandos
</h2>

<button onclick="enviarComando('PING')">
PING
</button>

<button onclick="enviarComando('STATUS')">
STATUS
</button>

</div>


<div class="card">

<h2>
Última resposta
</h2>

<pre id="resposta">
Nenhuma resposta recebida.
</pre>

<div class="small"
id="horaResposta">
-
</div>

</div>


</div>


<script>

const deviceId =
    "celular-001";


// ========================================
// ENVIAR COMANDO
// ========================================

async function enviarComando(command) {

    try {

        const resposta =
            await fetch(
                "/api/command",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        deviceId,
                        command
                    })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            document.getElementById(
                "resposta"
            ).textContent =
                dados.erro ||
                "Erro ao enviar comando";

            return;
        }

        document.getElementById(
            "resposta"
        ).textContent =
            "Comando enviado: " +
            command;

        // Aguarda o Android processar.

        setTimeout(
            atualizarResposta,
            2000
        );

    } catch (erro) {

        document.getElementById(
            "resposta"
        ).textContent =
            "Erro de comunicação com o servidor.";
    }
}


// ========================================
// ATUALIZAR DISPOSITIVO
// ========================================

async function atualizarDispositivo() {

    try {

        const resposta =
            await fetch(
                "/api/devices"
            );

        const dados =
            await resposta.json();

        if (
            !dados.sucesso ||
            !dados.dispositivos
        ) {
            return;
        }

        const dispositivo =
            dados.dispositivos.find(
                d =>
                    d.deviceId ===
                    deviceId
            );

        if (!dispositivo) {

            document.getElementById(
                "status"
            ).textContent =
                "OFFLINE";

            return;
        }


        document.getElementById(
            "status"
        ).textContent =
            dispositivo.status;


        document.getElementById(
            "marca"
        ).textContent =
            dispositivo.marca || "-";


        document.getElementById(
            "fabricante"
        ).textContent =
            dispositivo.fabricante || "-";


        document.getElementById(
            "modelo"
        ).textContent =
            dispositivo.modelo || "-";


        document.getElementById(
            "android"
        ).textContent =
            dispositivo.android || "-";


        document.getElementById(
            "ip"
        ).textContent =
            dispositivo.ip || "-";


        document.getElementById(
            "cidade"
        ).textContent =
            dispositivo.cidade || "-";


        document.getElementById(
            "estado"
        ).textContent =
            dispositivo.estado || "-";


        document.getElementById(
            "cep"
        ).textContent =
            dispositivo.cep || "-";


        document.getElementById(
            "pais"
        ).textContent =
            dispositivo.pais || "-";


        document.getElementById(
            "latitude"
        ).textContent =
            dispositivo.latitude ?? "-";


        document.getElementById(
            "longitude"
        ).textContent =
            dispositivo.longitude ?? "-";


        document.getElementById(
            "endereco"
        ).textContent =
            dispositivo.endereco || "-";


        if (dispositivo.ultimoContato) {

            const data =
                new Date(
                    dispositivo.ultimoContato
                );

            document.getElementById(
                "ultimoContato"
            ).textContent =
                "Último contato: " +
                data.toLocaleString(
                    "pt-BR"
                );
        }

    } catch (erro) {

        console.error(erro);
    }
}


// ========================================
// ATUALIZAR RESPOSTA
// ========================================

async function atualizarResposta() {

    try {

        const resposta =
            await fetch(
                "/api/response/" +
                deviceId
            );

        const dados =
            await resposta.json();

        if (
            !dados.sucesso ||
            !dados.resposta
        ) {
            return;
        }

        document.getElementById(
            "resposta"
        ).textContent =
            dados.resposta.response;


        if (
            dados.resposta.recebidoEm
        ) {

            const data =
                new Date(
                    dados.resposta.recebidoEm
                );

            document.getElementById(
                "horaResposta"
            ).textContent =
                "Recebido em: " +
                data.toLocaleString(
                    "pt-BR"
                );
        }

    } catch (erro) {

        console.error(erro);
    }
}


// ========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ========================================

atualizarDispositivo();

atualizarResposta();


setInterval(
    atualizarDispositivo,
    5000
);


setInterval(
    atualizarResposta,
    3000
);

</script>

</body>

</html>

    `);
});


// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "       SERVIDOR INICIADO"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "Painel: /"
        );

        console.log(
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);