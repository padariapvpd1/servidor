const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ========================================
// MEMÓRIA
// ========================================

const comandosPendentes = new Map();
const respostasDispositivos = new Map();
const dispositivos = new Map();
const historicoComandos = [];

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
// REGISTRAR HISTÓRICO
// ========================================

function registrarComando(deviceId, command, detalhes = "") {
    historicoComandos.unshift({
        deviceId,
        command,
        detalhes,
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
            `dispositivo-${ip}`;

        const dispositivoAnterior =
            dispositivos.get(deviceId);

        const dispositivo = {
            deviceId,

            marca: dados.marca || "",
            fabricante: dados.fabricante || "",
            modelo: dados.modelo || "",
            android: dados.android || "",

            ip,

            bateria:
                typeof dados.bateria === "number"
                    ? dados.bateria
                    : dispositivoAnterior?.bateria ?? null,

            carregando:
                typeof dados.carregando === "boolean"
                    ? dados.carregando
                    : dispositivoAnterior?.carregando ?? null,

            armazenamentoLivre:
                typeof dados.armazenamentoLivre === "number"
                    ? dados.armazenamentoLivre
                    : dispositivoAnterior?.armazenamentoLivre ?? null,

            armazenamentoTotal:
                typeof dados.armazenamentoTotal === "number"
                    ? dados.armazenamentoTotal
                    : dispositivoAnterior?.armazenamentoTotal ?? null,

            latitude:
                typeof dados.latitude === "number"
                    ? dados.latitude
                    : dispositivoAnterior?.latitude ?? null,

            longitude:
                typeof dados.longitude === "number"
                    ? dados.longitude
                    : dispositivoAnterior?.longitude ?? null,

            bairro:
                dados.bairro ||
                dispositivoAnterior?.bairro ||
                "",

            cidade:
                dados.cidade ||
                dispositivoAnterior?.cidade ||
                "",

            estado:
                dados.estado ||
                dispositivoAnterior?.estado ||
                "",

            cep:
                dados.cep ||
                dispositivoAnterior?.cep ||
                "",

            pais:
                dados.pais ||
                dispositivoAnterior?.pais ||
                "",

            endereco:
                dados.endereco ||
                dispositivoAnterior?.endereco ||
                "",

            revogado:
                dispositivoAnterior?.revogado || false,

            primeiroContato:
                dispositivoAnterior?.primeiroContato ||
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
        console.log("IP:          ", ip);
        console.log("Bateria:     ", dispositivo.bateria);
        console.log("Latitude:    ", dispositivo.latitude);
        console.log("Longitude:   ", dispositivo.longitude);
        console.log("Revogado:    ", dispositivo.revogado);
        console.log("========================================");
        console.log("");

        // ========================================
        // LOCALIZAÇÃO
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
                    "Erro ao consultar localização:",
                    erro.message
                );
            }
        }

        res.status(200).json({
            sucesso: true,
            deviceId
        });

    } catch (erro) {
        console.error(
            "Erro ao processar dispositivo:",
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
        command,
        mensagem
    } = req.body || {};

    if (!deviceId || !command) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId e command são obrigatórios"
        });
    }

    const comandosPermitidos = [
        "PING",
        "STATUS",
        "MESSAGE",
        "NOTIFICATION"
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
        command,
        mensagem: mensagem || "",
        criadoEm: new Date().toISOString()
    };

    comandosPendentes.get(deviceId).push(comando);

    registrarComando(
        deviceId,
        command,
        mensagem || ""
    );

    console.log("");
    console.log("========================================");
    console.log("          NOVO COMANDO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("Comando:    ", command);

    if (mensagem) {
        console.log("Mensagem:   ", mensagem);
    }

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
        comando
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
        response,
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
    const { deviceId } = req.body || {};

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

    registrarComando(
        deviceId,
        "REVOKE",
        "Dispositivo revogado"
    );

    console.log("");
    console.log("========================================");
    console.log("       DISPOSITIVO REVOGADO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("========================================");
    console.log("");

    res.json({
        sucesso: true,
        mensagem: "Dispositivo revogado"
    });
});

// ========================================
// REATIVAR DISPOSITIVO
// ========================================

app.post("/api/device/unrevoke", (req, res) => {
    const { deviceId } = req.body || {};

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

    registrarComando(
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
    padding: 0;

    background:
        linear-gradient(
            135deg,
            #080b12,
            #101827
        );

    color: #ffffff;

    font-family:
        Arial,
        Helvetica,
        sans-serif;

    min-height: 100vh;
}

.container {
    width: 94%;
    max-width: 1400px;

    margin: auto;

    padding: 30px 0 50px;
}

.header {
    background: #111827;

    border: 1px solid #263247;

    border-radius: 18px;

    padding: 25px;

    margin-bottom: 20px;

    box-shadow:
        0 15px 40px
        rgba(0,0,0,0.35);
}

.header h1 {
    margin: 0 0 8px;

    font-size: 32px;
}

.header p {
    margin: 0;

    color: #9ca3af;
}

.server-status {
    margin-top: 18px;

    display: inline-flex;

    align-items: center;

    gap: 8px;

    padding: 8px 14px;

    border-radius: 20px;

    background: #062e1b;

    color: #4ade80;

    font-size: 14px;
}

.dot {
    width: 9px;
    height: 9px;

    border-radius: 50%;

    background: #22c55e;

    box-shadow:
        0 0 10px
        rgba(34,197,94,0.8);
}

.cards {
    display: grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(180px, 1fr)
        );

    gap: 15px;

    margin-bottom: 25px;
}

.card {
    background: #111827;

    border: 1px solid #263247;

    border-radius: 16px;

    padding: 20px;
}

.card-title {
    color: #9ca3af;

    font-size: 13px;

    letter-spacing: 1px;

    margin-bottom: 8px;
}

.card-value {
    font-size: 32px;

    font-weight: bold;
}

.devices-title {
    margin: 25px 0 15px;
}

.device {
    background: #111827;

    border: 1px solid #263247;

    border-radius: 18px;

    padding: 22px;

    margin-bottom: 15px;

    box-shadow:
        0 10px 30px
        rgba(0,0,0,0.25);
}

.device-header {
    display: flex;

    justify-content: space-between;

    align-items: center;

    gap: 15px;

    flex-wrap: wrap;
}

.device-name {
    font-size: 22px;

    font-weight: bold;
}

.device-id {
    color: #9ca3af;

    font-size: 13px;

    margin-top: 5px;
}

.status {
    padding: 7px 13px;

    border-radius: 20px;

    font-size: 12px;

    font-weight: bold;
}

.online {
    background: #06351e;

    color: #4ade80;

    border: 1px solid #166534;
}

.offline {
    background: #351010;

    color: #f87171;

    border: 1px solid #7f1d1d;
}

.revoked {
    background: #3b2a05;

    color: #fbbf24;

    border: 1px solid #92400e;
}

.info-grid {
    display: grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(220px, 1fr)
        );

    gap: 10px;

    margin-top: 20px;
}

.info {
    background: #0b111d;

    border-radius: 10px;

    padding: 12px;
}

.info-label {
    color: #6b7280;

    font-size: 11px;

    text-transform: uppercase;

    margin-bottom: 5px;
}

.info-value {
    font-size: 14px;

    word-break: break-word;
}

.actions {
    display: flex;

    flex-wrap: wrap;

    gap: 10px;

    margin-top: 20px;
}

button {
    border: none;

    border-radius: 9px;

    padding: 11px 17px;

    background: #2563eb;

    color: white;

    font-weight: bold;

    cursor: pointer;
}

button:hover {
    background: #1d4ed8;
}

button.secondary {
    background: #374151;
}

button.secondary:hover {
    background: #4b5563;
}

button.warning {
    background: #b45309;
}

button.warning:hover {
    background: #92400e;
}

.empty {
    text-align: center;

    padding: 45px;

    background: #111827;

    border: 1px solid #263247;

    border-radius: 18px;

    color: #9ca3af;
}

.history {
    margin-top: 30px;

    background: #111827;

    border: 1px solid #263247;

    border-radius: 18px;

    padding: 22px;
}

.history-item {
    padding: 12px 0;

    border-bottom:
        1px solid #1f2937;

    font-size: 14px;
}

.history-item:last-child {
    border-bottom: none;
}

.history-command {
    font-weight: bold;
}

.history-details {
    color: #9ca3af;

    margin-top: 4px;
}

.refresh {
    color: #6b7280;

    font-size: 12px;

    margin-top: 10px;
}

</style>

</head>

<body>

<div class="container">

    <div class="header">

        <h1>
            MASTER CONTROL
        </h1>

        <p>
            Painel de administração de dispositivos
        </p>

        <div class="server-status">

            <span class="dot"></span>

            SERVIDOR ONLINE

        </div>

        <div
            class="refresh"
            id="refreshText"
        >
            Atualizando...
        </div>

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


    <h2 class="devices-title">
        Dispositivos
    </h2>


    <div id="devices">

        <div class="empty">
            Procurando dispositivos...
        </div>

    </div>


    <div class="history">

        <h2>
            Histórico de comandos
        </h2>

        <div id="historyList">

            <div class="empty">
                Nenhum comando registrado.
            </div>

        </div>

    </div>

</div>


<script>

function escapar(texto) {

    if (
        texto === null ||
        texto === undefined
    ) {
        return "";
    }

    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ========================================
// FORMATAR DATA
// ========================================

function formatarData(data) {

    if (!data) {
        return "Desconhecido";
    }

    try {

        return new Date(data)
            .toLocaleString(
                "pt-BR"
            );

    } catch {

        return data;
    }
}


// ========================================
// FORMATAR ARMAZENAMENTO
// ========================================

function formatarBytes(bytes) {

    if (
        bytes === null ||
        bytes === undefined
    ) {
        return "Não informado";
    }

    if (bytes < 1024) {
        return bytes + " B";
    }

    if (bytes < 1024 * 1024) {
        return (
            (bytes / 1024)
                .toFixed(1)
            + " KB"
        );
    }

    if (
        bytes <
        1024 * 1024 * 1024
    ) {
        return (
            (bytes /
                (1024 * 1024))
                .toFixed(1)
            + " MB"
        );
    }

    return (
        (bytes /
            (1024 * 1024 * 1024))
            .toFixed(2)
        + " GB"
    );
}


// ========================================
// ENVIAR COMANDO
// ========================================

async function enviarComando(
    deviceId,
    command,
    mensagem = ""
) {

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

                    body:
                        JSON.stringify({
                            deviceId,
                            command,
                            mensagem
                        })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Erro ao enviar comando"
            );

            return;
        }

        atualizarTudo();

    } catch (erro) {

        alert(
            "Erro de comunicação com o servidor."
        );

        console.error(erro);
    }
}


// ========================================
// RENDERIZAR DISPOSITIVOS
// ========================================

function renderizarDispositivos(
    lista
) {

    const container =
        document.getElementById(
            "devices"
        );

    document.getElementById(
        "total"
    ).textContent =
        lista.length;

    document.getElementById(
        "online"
    ).textContent =
        lista.filter(
            d => d.status === "ONLINE"
        ).length;

    document.getElementById(
        "offline"
    ).textContent =
        lista.filter(
            d => d.status === "OFFLINE"
        ).length;


    if (lista.length === 0) {

        container.innerHTML = `
            <div class="empty">
                Nenhum dispositivo conectado.
            </div>
        `;

        return;
    }


    container.innerHTML =
        lista.map(
            dispositivo => {

                let classeStatus =
                    dispositivo.revogado
                        ? "revoked"
                        : dispositivo.status ===
                          "ONLINE"
                            ? "online"
                            : "offline";

                let textoStatus =
                    dispositivo.revogado
                        ? "REVOGADO"
                        : dispositivo.status;


                const bateria =
                    dispositivo.bateria !== null
                        ? dispositivo.bateria + "%"
                        : "Não informado";


                const carregando =
                    dispositivo.carregando === true
                        ? "Sim"
                        : dispositivo.carregando === false
                            ? "Não"
                            : "Não informado";


                const localizacao =
                    dispositivo.latitude !== null &&
                    dispositivo.longitude !== null

                        ? `${escapar(
                            dispositivo.latitude
                        )}, ${
                            escapar(
                                dispositivo.longitude
                            )
                        }`

                        : "Não informado";


                return `

                <div class="device">

                    <div class="device-header">

                        <div>

                            <div class="device-name">

                                ${escapar(
                                    dispositivo.modelo ||
                                    "Dispositivo"
                                )}

                            </div>

                            <div class="device-id">

                                ID:
                                ${escapar(
                                    dispositivo.deviceId
                                )}

                            </div>

                        </div>


                        <div
                            class="status ${classeStatus}"
                        >
                            ${textoStatus}
                        </div>

                    </div>


                    <div class="info-grid">


                        <div class="info">

                            <div class="info-label">
                                Fabricante
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    dispositivo.fabricante ||
                                    dispositivo.marca ||
                                    "Não informado"
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Android
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    dispositivo.android ||
                                    "Não informado"
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                IP
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    dispositivo.ip ||
                                    "Não informado"
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Bateria
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    bateria
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Carregando
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    carregando
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Localização
                            </div>

                            <div class="info-value">
                                ${localizacao}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Endereço
                            </div>

                            <div class="info-value">
                                ${escapar(
                                    dispositivo.endereco ||
                                    "Não informado"
                                )}
                            </div>

                        </div>


                        <div class="info">

                            <div class="info-label">
                                Último contato
                            </div>

                            <div class="info-value">
                                ${formatarData(
                                    dispositivo.ultimoContato
                                )}
                            </div>

                        </div>


                    </div>


                    <div class="actions">

                        <button
                            onclick="enviarComando(
                                '${escapar(
                                    dispositivo.deviceId
                                )}',
                                'PING'
                            )"
                        >
                            PING
                        </button>


                        <button
                            class="secondary"
                            onclick="enviarComando(
                                '${escapar(
                                    dispositivo.deviceId
                                )}',
                                'STATUS'
                            )"
                        >
                            STATUS
                        </button>


                        ${
                            !dispositivo.revogado

                            ? `

                            <button
                                class="warning"
                                onclick="revogar(
                                    '${escapar(
                                        dispositivo.deviceId
                                    )}'
                                )"
                            >
                                REVOGAR
                            </button>

                            `

                            : `

                            <button
                                onclick="reativar(
                                    '${escapar(
                                        dispositivo.deviceId
                                    )}'
                                )"
                            >
                                REATIVAR
                            </button>

                            `
                        }

                    </div>

                </div>

                `;
            }
        ).join("");
}


// ========================================
// HISTÓRICO
// ========================================

function renderizarHistorico(
    historico
) {

    const container =
        document.getElementById(
            "historyList"
        );

    if (
        !historico ||
        historico.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Nenhum comando registrado.
            </div>
        `;

        return;
    }


    container.innerHTML =
        historico
            .slice(0, 20)
            .map(
                item => `

                <div class="history-item">

                    <div class="history-command">

                        ${escapar(
                            item.command
                        )}

                        — 

                        ${escapar(
                            item.deviceId
                        )}

                    </div>

                    <div class="history-details">

                        ${escapar(
                            item.detalhes ||
                            ""
                        )}

                        <br>

                        ${formatarData(
                            item.criadoEm
                        )}

                    </div>

                </div>

                `
            )
            .join("");
}


// ========================================
// ATUALIZAR DISPOSITIVOS
// ========================================

async function atualizarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?_=" +
                Date.now()
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {
            return;
        }

        renderizarDispositivos(
            dados.dispositivos || []
        );

        document.getElementById(
            "refreshText"
        ).textContent =
            "Última atualização: " +
            new Date()
                .toLocaleTimeString(
                    "pt-BR"
                );

    } catch (erro) {

        console.error(
            "Erro ao buscar dispositivos:",
            erro
        );

    }
}


// ========================================
// ATUALIZAR HISTÓRICO
// ========================================

async function atualizarHistorico() {

    try {

        const resposta =
            await fetch(
                "/api/history?_=" +
                Date.now()
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {
            return;
        }

        renderizarHistorico(
            dados.historico || []
        );

    } catch (erro) {

        console.error(
            "Erro ao buscar histórico:",
            erro
        );
    }
}


// ========================================
// ATUALIZAR TUDO
// ========================================

async function atualizarTudo() {

    await Promise.all([
        atualizarDispositivos(),
        atualizarHistorico()
    ]);
}


// ========================================
// REVOGAR
// ========================================

async function revogar(
    deviceId
) {

    if (
        !confirm(
            "Revogar este dispositivo?"
        )
    ) {
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

                    body:
                        JSON.stringify({
                            deviceId
                        })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Erro ao revogar."
            );

            return;
        }

        atualizarTudo();

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de comunicação."
        );
    }
}


// ========================================
// REATIVAR
// ========================================

async function reativar(
    deviceId
) {

    try {

        const resposta =
            await fetch(
                "/api/device/unrevoke",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            deviceId
                        })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Erro ao reativar."
            );

            return;
        }

        atualizarTudo();

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de comunicação."
        );
    }
}


// ========================================
// INICIALIZAÇÃO
// ========================================

atualizarTudo();


// Atualiza a cada 5 segundos

setInterval(
    atualizarTudo,
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
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);