const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ========================================
// MEMÓRIA
// ========================================

const dispositivos = new Map();
const comandosPendentes = new Map();
const respostasDispositivos = new Map();
const historicoComandos = [];

// ========================================
// BUSCAR ENDEREÇO
// ========================================

async function buscarEndereco(latitude, longitude) {
    const url =
        "https://nominatim.openstreetmap.org/reverse" +
        "?format=jsonv2" +
        "&lat=" + encodeURIComponent(latitude) +
        "&lon=" + encodeURIComponent(longitude) +
        "&zoom=18" +
        "&addressdetails=1";

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "MasterControl/1.0"
        }
    });

    if (!resposta.ok) {
        throw new Error(
            "Nominatim respondeu HTTP " + resposta.status
        );
    }

    return await resposta.json();
}

// ========================================
// HISTÓRICO
// ========================================

function registrarHistorico(deviceId, command, detalhes) {
    historicoComandos.unshift({
        deviceId: deviceId,
        command: command,
        detalhes: detalhes || "",
        criadoEm: new Date().toISOString()
    });

    if (historicoComandos.length > 500) {
        historicoComandos.pop();
    }
}

// ========================================
// RECEBER DISPOSITIVO
// ========================================

app.post("/api/device", async (req, res) => {
    try {
        const dados = req.body || {};

        let ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "Desconhecido";

        if (typeof ip === "string" && ip.includes(",")) {
            ip = ip.split(",")[0].trim();
        }

        ip = String(ip).replace("::ffff:", "");

        const deviceId =
            dados.deviceId ||
            dados.id ||
            "dispositivo-" + ip;

        const anterior = dispositivos.get(deviceId);

        const dispositivo = {
            deviceId: deviceId,

            marca: dados.marca || anterior?.marca || "",
            fabricante: dados.fabricante || anterior?.fabricante || "",
            modelo: dados.modelo || anterior?.modelo || "",
            android: dados.android || anterior?.android || "",

            ip: ip,

            bateria:
                typeof dados.bateria === "number"
                    ? dados.bateria
                    : anterior?.bateria ?? null,

            carregando:
                typeof dados.carregando === "boolean"
                    ? dados.carregando
                    : anterior?.carregando ?? null,

            armazenamentoLivre:
                typeof dados.armazenamentoLivre === "number"
                    ? dados.armazenamentoLivre
                    : anterior?.armazenamentoLivre ?? null,

            armazenamentoTotal:
                typeof dados.armazenamentoTotal === "number"
                    ? dados.armazenamentoTotal
                    : anterior?.armazenamentoTotal ?? null,

            latitude:
                typeof dados.latitude === "number"
                    ? dados.latitude
                    : anterior?.latitude ?? null,

            longitude:
                typeof dados.longitude === "number"
                    ? dados.longitude
                    : anterior?.longitude ?? null,

            bairro:
                dados.bairro ||
                anterior?.bairro ||
                "",

            cidade:
                dados.cidade ||
                anterior?.cidade ||
                "",

            estado:
                dados.estado ||
                anterior?.estado ||
                "",

            cep:
                dados.cep ||
                anterior?.cep ||
                "",

            pais:
                dados.pais ||
                anterior?.pais ||
                "",

            endereco:
                dados.endereco ||
                anterior?.endereco ||
                "",

            revogado:
                anterior?.revogado || false,

            primeiroContato:
                anterior?.primeiroContato ||
                new Date().toISOString(),

            ultimoContato:
                new Date().toISOString()
        };

        dispositivos.set(deviceId, dispositivo);

        console.log("");
        console.log("========================================");
        console.log("       DISPOSITIVO CONECTADO");
        console.log("========================================");
        console.log("ID:          ", deviceId);
        console.log("Marca:       ", dispositivo.marca);
        console.log("Fabricante:  ", dispositivo.fabricante);
        console.log("Modelo:      ", dispositivo.modelo);
        console.log("Android:     ", dispositivo.android);
        console.log("IP:          ", dispositivo.ip);
        console.log("Bateria:     ", dispositivo.bateria);
        console.log("Latitude:    ", dispositivo.latitude);
        console.log("Longitude:   ", dispositivo.longitude);
        console.log("Revogado:    ", dispositivo.revogado);
        console.log("========================================");
        console.log("");

        // ========================================
        // BUSCAR ENDEREÇO
        // ========================================

        if (
            typeof dispositivo.latitude === "number" &&
            typeof dispositivo.longitude === "number"
        ) {
            try {
                const endereco = await buscarEndereco(
                    dispositivo.latitude,
                    dispositivo.longitude
                );

                const address = endereco.address || {};
                const atual = dispositivos.get(deviceId);

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
                        atual.endereco ||
                        endereco.display_name ||
                        "";

                    dispositivos.set(deviceId, atual);
                }
            } catch (erro) {
                console.error(
                    "Erro ao buscar endereço:",
                    erro.message
                );
            }
        }

        res.status(200).json({
            sucesso: true,
            deviceId: deviceId
        });

    } catch (erro) {
        console.error(
            "Erro em /api/device:",
            erro
        );

        res.status(500).json({
            sucesso: false,
            erro: "Erro interno do servidor"
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
            erro: "deviceId e command são obrigatórios"
        });
    }

    // SOMENTE STATUS POR ENQUANTO
    const comandosPermitidos = [
        "STATUS"
    ];

    if (!comandosPermitidos.includes(command)) {
        return res.status(400).json({
            sucesso: false,
            erro: "Comando não permitido"
        });
    }

    const dispositivo = dispositivos.get(deviceId);

    if (!dispositivo) {
        return res.status(404).json({
            sucesso: false,
            erro: "Dispositivo não encontrado"
        });
    }

    if (dispositivo.revogado) {
        return res.status(403).json({
            sucesso: false,
            erro: "Dispositivo revogado"
        });
    }

    if (!comandosPendentes.has(deviceId)) {
        comandosPendentes.set(deviceId, []);
    }

    const comando = {
        command: command,
        criadoEm: new Date().toISOString()
    };

    comandosPendentes.get(deviceId).push(comando);

    registrarHistorico(
        deviceId,
        command,
        ""
    );

    console.log("");
    console.log("========================================");
    console.log("          NOVO COMANDO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("Comando:    ", command);
    console.log("========================================");
    console.log("");

    res.status(200).json({
        sucesso: true,
        mensagem: "Comando colocado na fila"
    });
});

// ========================================
// ANDROID BUSCA COMANDO
// ========================================

app.get("/api/command/:deviceId", (req, res) => {
    const deviceId = req.params.deviceId;

    const dispositivo = dispositivos.get(deviceId);

    if (!dispositivo) {
        return res.status(404).json({
            sucesso: false,
            erro: "Dispositivo não encontrado"
        });
    }

    if (dispositivo.revogado) {
        return res.status(403).json({
            sucesso: false,
            erro: "Dispositivo revogado",
            comando: null
        });
    }

    const fila =
        comandosPendentes.get(deviceId) || [];

    if (fila.length === 0) {
        return res.status(200).json({
            sucesso: true,
            comando: null
        });
    }

    const comando = fila.shift();

    res.status(200).json({
        sucesso: true,
        comando: comando
    });
});

// ========================================
// RECEBER RESPOSTA
// ========================================

app.post("/api/response", (req, res) => {
    const {
        deviceId,
        response
    } = req.body || {};

    if (!deviceId || response === undefined) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId e response são obrigatórios"
        });
    }

    respostasDispositivos.set(deviceId, {
        response: response,
        recebidoEm: new Date().toISOString()
    });

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
    const agora = new Date();

    const lista =
        Array.from(dispositivos.values())
            .map(dispositivo => {

                const ultimoContato =
                    new Date(
                        dispositivo.ultimoContato
                    );

                const segundos =
                    (agora - ultimoContato) / 1000;

                return {
                    ...dispositivo,

                    status:
                        segundos <= 30 &&
                        !dispositivo.revogado
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
// ÚLTIMA RESPOSTA
// ========================================

app.get("/api/response/:deviceId", (req, res) => {
    const resposta =
        respostasDispositivos.get(
            req.params.deviceId
        );

    res.json({
        sucesso: true,
        resposta: resposta || null
    });
});

// ========================================
// HISTÓRICO
// ========================================

app.get("/api/history", (req, res) => {
    res.json({
        sucesso: true,
        historico: historicoComandos
    });
});

// ========================================
// REVOGAR DISPOSITIVO
// ========================================

app.post("/api/device/revoke", (req, res) => {
    const {
        deviceId
    } = req.body || {};

    if (!deviceId) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId é obrigatório"
        });
    }

    const dispositivo =
        dispositivos.get(deviceId);

    if (!dispositivo) {
        return res.status(404).json({
            sucesso: false,
            erro: "Dispositivo não encontrado"
        });
    }

    dispositivo.revogado = true;

    dispositivos.set(
        deviceId,
        dispositivo
    );

    comandosPendentes.delete(deviceId);

    registrarHistorico(
        deviceId,
        "REVOKE",
        "Dispositivo revogado"
    );

    res.json({
        sucesso: true,
        mensagem: "Dispositivo revogado"
    });
});

// ========================================
// REATIVAR DISPOSITIVO
// ========================================

app.post("/api/device/unrevoke", (req, res) => {
    const {
        deviceId
    } = req.body || {};

    if (!deviceId) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId é obrigatório"
        });
    }

    const dispositivo =
        dispositivos.get(deviceId);

    if (!dispositivo) {
        return res.status(404).json({
            sucesso: false,
            erro: "Dispositivo não encontrado"
        });
    }

    dispositivo.revogado = false;

    dispositivos.set(
        deviceId,
        dispositivo
    );

    registrarHistorico(
        deviceId,
        "UNREVOKE",
        "Dispositivo reativado"
    );

    res.json({
        sucesso: true,
        mensagem: "Dispositivo reativado"
    });
});

// ========================================
// PAINEL MASTER CONTROL
// ========================================

app.get("/", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>MASTER CONTROL</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    padding: 30px;
    background: #0f1115;
    color: white;
    font-family: Arial, sans-serif;
}

h1 {
    margin-bottom: 5px;
}

.subtitle {
    color: #999;
    margin-bottom: 30px;
}

.cards {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 30px;
}

.card {
    background: #191c23;
    border: 1px solid #292d36;
    border-radius: 12px;
    padding: 20px;
    min-width: 180px;
}

.card-title {
    color: #999;
    font-size: 13px;
    margin-bottom: 10px;
}

.card-value {
    font-size: 32px;
    font-weight: bold;
}

.device {
    background: #191c23;
    border: 1px solid #292d36;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 15px;
}

.device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
}

.device-name {
    font-size: 20px;
    font-weight: bold;
}

.online {
    color: #42e87d;
}

.offline {
    color: #ff5555;
}

.info {
    color: #aaa;
    line-height: 1.7;
    margin-top: 15px;
}

button {
    background: #292d36;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    margin-right: 8px;
}

button:hover {
    background: #3a3f4b;
}

.history {
    margin-top: 30px;
}

.history-item {
    background: #191c23;
    border: 1px solid #292d36;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
    color: #aaa;
}

.empty {
    color: #777;
    padding: 20px;
}

</style>

</head>

<body>

<h1>MASTER CONTROL</h1>

<div class="subtitle">
Painel de administração de dispositivos
</div>

<div class="cards">

    <div class="card">
        <div class="card-title">
            DISPOSITIVOS
        </div>

        <div
            class="card-value"
            id="total"
        >
            0
        </div>
    </div>

    <div class="card">
        <div class="card-title">
            ONLINE
        </div>

        <div
            class="card-value"
            id="online"
        >
            0
        </div>
    </div>

    <div class="card">
        <div class="card-title">
            OFFLINE
        </div>

        <div
            class="card-value"
            id="offline"
        >
            0
        </div>
    </div>

</div>

<div id="devices">

    <div class="empty">
        Procurando dispositivos...
    </div>

</div>

<div class="history">

    <h2>
        Histórico
    </h2>

    <div id="historyList">

        <div class="empty">
            Nenhum comando registrado.
        </div>

    </div>

</div>

<script>

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch("/api/devices");

        const dados =
            await resposta.json();

        if (!dados.sucesso) {
            return;
        }

        const lista =
            dados.dispositivos || [];

        document.getElementById("total")
            .textContent = lista.length;

        document.getElementById("online")
            .textContent =
                lista.filter(
                    d => d.status === "ONLINE"
                ).length;

        document.getElementById("offline")
            .textContent =
                lista.filter(
                    d => d.status === "OFFLINE"
                ).length;

        const container =
            document.getElementById("devices");

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhum dispositivo conectado.' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista.map(d => {

                const statusClass =
                    d.status === "ONLINE"
                        ? "online"
                        : "offline";

                const bateria =
                    d.bateria !== null
                        ? d.bateria + "%"
                        : "Não informado";

                const local =
                    d.cidade
                        ? d.cidade +
                          ", " +
                          d.estado
                        : "Não informado";

                return \`
<div class="device">

    <div class="device-header">

        <div>

            <div class="device-name">
                \${d.deviceId}
            </div>

            <div class="\${statusClass}">
                \${d.status}
            </div>

        </div>

        <div>

            <button
                onclick="enviarStatus('\${d.deviceId}')"
            >
                STATUS
            </button>

            <button
                onclick="revogar('\${d.deviceId}')"
            >
                REVOGAR
            </button>

        </div>

    </div>

    <div class="info">

        <b>Marca:</b>
        \${d.marca || "Não informado"}
        <br>

        <b>Modelo:</b>
        \${d.modelo || "Não informado"}
        <br>

        <b>Android:</b>
        \${d.android || "Não informado"}
        <br>

        <b>IP:</b>
        \${d.ip || "Não informado"}
        <br>

        <b>Bateria:</b>
        \${bateria}
        <br>

        <b>Local:</b>
        \${local}
        <br>

        <b>Endereço:</b>
        \${d.endereco || "Não informado"}
        <br>

        <b>Latitude:</b>
        \${d.latitude ?? "Não informado"}
        <br>

        <b>Longitude:</b>
        \${d.longitude ?? "Não informado"}

    </div>

</div>
\`;

            }).join("");

    } catch (erro) {

        console.error(
            "Erro ao carregar dispositivos:",
            erro
        );

    }
}

async function enviarStatus(deviceId) {

    try {

        const resposta =
            await fetch("/api/command", {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    deviceId: deviceId,
                    command: "STATUS"
                })
            });

        const dados =
            await resposta.json();

        alert(
            dados.mensagem ||
            dados.erro ||
            "Comando enviado"
        );

    } catch (erro) {

        alert(
            "Erro ao enviar comando."
        );

    }
}

async function revogar(deviceId) {

    const confirmar =
        confirm(
            "Deseja revogar o dispositivo " +
            deviceId +
            "?"
        );

    if (!confirmar) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/api/device/revoke",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        deviceId: deviceId
                    })
                }
            );

        const dados =
            await resposta.json();

        alert(
            dados.mensagem ||
            dados.erro ||
            "Operação concluída"
        );

        carregarDispositivos();

    } catch (erro) {

        alert(
            "Erro ao revogar dispositivo."
        );

    }
}

async function carregarHistorico() {

    try {

        const resposta =
            await fetch("/api/history");

        const dados =
            await resposta.json();

        const lista =
            dados.historico || [];

        const container =
            document.getElementById(
                "historyList"
            );

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhum comando registrado.' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista.slice(0, 30)
                .map(item => \`
<div class="history-item">

    <b>\${item.command}</b>

    — \${item.deviceId}

    <br>

    \${item.criadoEm}

</div>
\`)
                .join("");

    } catch (erro) {

        console.error(
            "Erro no histórico:",
            erro
        );

    }
}

carregarDispositivos();
carregarHistorico();

setInterval(
    carregarDispositivos,
    5000
);

setInterval(
    carregarHistorico,
    5000
);

</script>

</body>

</html>
    `);
});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", (req, res) => {

    res.json({
        sucesso: true,
        servidor: "MASTER CONTROL",
        status: "ONLINE",
        dispositivos: dispositivos.size,
        hora: new Date().toISOString()
    });
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
            "          MASTER CONTROL"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Servidor iniciado"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "Painel: /"
        );

        console.log(
            "Health: /health"
        );

        console.log(
            "Comando disponível: STATUS"
        );

        console.log(
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);