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

    // Mantém somente os últimos 500 registros
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
    background: #0b0f14;
    color: #ffffff;
    font-family: Arial, sans-serif;
}

header {
    background: #111820;
    padding: 20px;
    border-bottom: 1px solid #27313d;
}

header h1 {
    margin: 0;
    font-size: 24px;
}

header p {
    margin: 7px 0 0;
    color: #8d9aaa;
}

.container {
    padding: 20px;
    max-width: 1400px;
    margin: auto;
}

.cards {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));

    gap: 15px;

    margin-bottom: 20px;
}

.card {
    background: #111820;
    border: 1px solid #27313d;
    border-radius: 10px;
    padding: 18px;
}

.card-title {
    color: #8d9aaa;
    font-size: 13px;
}

.card-value {
    font-size: 27px;
    font-weight: bold;
    margin-top: 8px;
}

.device {
    background: #111820;
    border: 1px solid #27313d;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 15px;
}

.device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
}

.device-name {
    font-size: 19px;
    font-weight: bold;
}

.status {
    padding: 6px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
}

.online {
    background: #123d27;
    color: #5cff9a;
}

.offline {
    background: #3c1717;
    color: #ff7777;
}

.revogado {
    background: #493c12;
    color: #ffd75c;
}

.info {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));

    gap: 10px;

    margin-top: 15px;
}

.info-item {
    background: #0b0f14;
    border-radius: 8px;
    padding: 10px;
}

.info-label {
    color: #718094;
    font-size: 11px;
}

.info-value {
    margin-top: 5px;
    word-break: break-word;
}

.buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 15px;
}

button {
    border: none;
    border-radius: 7px;
    padding: 10px 14px;
    cursor: pointer;
    background: #1d2935;
    color: white;
}

button:hover {
    background: #293949;
}

button.danger {
    background: #4a1e1e;
}

button.success {
    background: #17452c;
}

.empty {
    background: #111820;
    border: 1px solid #27313d;
    border-radius: 10px;
    padding: 30px;
    text-align: center;
    color: #8d9aaa;
}

.history {
    margin-top: 30px;
}

.history-item {
    border-bottom: 1px solid #27313d;
    padding: 10px 0;
}

.history-command {
    font-weight: bold;
}

.history-details {
    color: #8d9aaa;
    font-size: 13px;
}

input {
    background: #0b0f14;
    border: 1px solid #27313d;
    border-radius: 7px;
    color: white;
    padding: 10px;
    width: 100%;
}

.message-box {
    margin-top: 10px;
    max-width: 500px;
}

</style>

</head>

<body>

<header>

    <h1>MASTER CONTROL</h1>

    <p>
        Painel de administração de dispositivos
    </p>

</header>

<div class="container">

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

</div>


<script>

let dispositivos = [];


// ========================================
// CARREGAR DISPOSITIVOS
// ========================================

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch("/api/devices");

        const dados =
            await resposta.json();

        dispositivos =
            dados.dispositivos || [];

        atualizarResumo();

        renderizarDispositivos();

    } catch (erro) {

        console.error(
            "Erro ao carregar dispositivos:",
            erro
        );

    }

}


// ========================================
// RESUMO
// ========================================

function atualizarResumo() {

    const online =
        dispositivos.filter(
            d => d.status === "ONLINE"
        ).length;

    const offline =
        dispositivos.filter(
            d => d.status === "OFFLINE"
        ).length;

    document.getElementById("total")
        .textContent =
        dispositivos.length;

    document.getElementById("online")
        .textContent =
        online;

    document.getElementById("offline")
        .textContent =
        offline;

}


// ========================================
// FORMATAR LOCALIZAÇÃO
// ========================================

function localizacao(d) {

    if (d.endereco) {
        return d.endereco;
    }

    if (d.cidade || d.estado) {

        return [
            d.cidade,
            d.estado,
            d.cep
        ]
        .filter(Boolean)
        .join(" - ");

    }

    if (
        d.latitude !== null &&
        d.longitude !== null
    ) {

        return (
            d.latitude +
            ", " +
            d.longitude
        );

    }

    return "Não informada";

}


// ========================================
// RENDERIZAR DISPOSITIVOS
// ========================================

function renderizarDispositivos() {

    const container =
        document.getElementById("devices");

    if (dispositivos.length === 0) {

        container.innerHTML = \`
            <div class="empty">
                Nenhum dispositivo conectado.
            </div>
        \`;

        return;
    }

    container.innerHTML =
        dispositivos.map(d => {

            let statusClass =
                d.revogado
                    ? "revogado"
                    : d.status === "ONLINE"
                        ? "online"
                        : "offline";

            let statusTexto =
                d.revogado
                    ? "REVOGADO"
                    : d.status;

            const bateria =
                d.bateria !== null &&
                d.bateria !== undefined
                    ? d.bateria + "%"
                    : "Não informada";

            const armazenamento =
                d.armazenamentoLivre !== null &&
                d.armazenamentoLivre !== undefined
                    ? formatarBytes(
                        d.armazenamentoLivre
                    )
                    : "Não informado";

            return \`

<div class="device">

    <div class="device-header">

        <div>

            <div class="device-name">

                \${escapeHtml(
                    d.modelo ||
                    d.deviceId
                )}

            </div>

            <div class="history-details">

                ID:
                \${escapeHtml(d.deviceId)}

            </div>

        </div>

        <div class="status \${statusClass}">

            \${statusTexto}

        </div>

    </div>


    <div class="info">

        <div class="info-item">

            <div class="info-label">
                FABRICANTE
            </div>

            <div class="info-value">
                \${escapeHtml(
                    d.fabricante || "-"
                )}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                MARCA
            </div>

            <div class="info-value">
                \${escapeHtml(
                    d.marca || "-"
                )}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                ANDROID
            </div>

            <div class="info-value">
                \${escapeHtml(
                    d.android || "-"
                )}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                IP
            </div>

            <div class="info-value">
                \${escapeHtml(
                    d.ip || "-"
                )}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                BATERIA
            </div>

            <div class="info-value">
                \${bateria}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                ARMAZENAMENTO LIVRE
            </div>

            <div class="info-value">
                \${armazenamento}
            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                LOCALIZAÇÃO
            </div>

            <div class="info-value">

                \${escapeHtml(
                    localizacao(d)
                )}

            </div>

        </div>


        <div class="info-item">

            <div class="info-label">
                ÚLTIMO CONTATO
            </div>

            <div class="info-value">

                \${formatarData(
                    d.ultimoContato
                )}

            </div>

        </div>

    </div>


    <div class="message-box">

        <input
            id="msg-\${safeId(d.deviceId)}"
            placeholder="Mensagem para o dispositivo"
        >

    </div>


    <div class="buttons">

        <button
            onclick="enviarComando(
                '\${jsSafe(d.deviceId)}',
                'PING'
            )"
        >
            PING
        </button>


        <button
            onclick="enviarComando(
                '\${jsSafe(d.deviceId)}',
                'STATUS'
            )"
        >
            STATUS
        </button>


        <button
            onclick="enviarMensagem(
                '\${jsSafe(d.deviceId)}'
            )"
        >
            ENVIAR MENSAGEM
        </button>


        <button
            class="success"
            onclick="enviarNotificacao(
                '\${jsSafe(d.deviceId)}'
            )"
        >
            NOTIFICAÇÃO
        </button>


        <button
            class="danger"
            onclick="revogar(
                '\${jsSafe(d.deviceId)}'
            )"
        >
            REVOGAR
        </button>

    </div>

</div>

            \`;

        }).join("");

}


// ========================================
// ENVIAR COMANDO
// ========================================

async function enviarComando(
    deviceId,
    command
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

                    body: JSON.stringify({
                        deviceId,
                        command
                    })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Não foi possível enviar."
            );

            return;
        }

        console.log(
            "Comando enviado:",
            command
        );

    } catch (erro) {

        alert(
            "Erro de comunicação com o servidor."
        );

    }

}


// ========================================
// ENVIAR MENSAGEM
// ========================================

async function enviarMensagem(
    deviceId
) {

    const campo =
        document.getElementById(
            "msg-" + safeId(deviceId)
        );

    if (!campo) {
        return;
    }

    const mensagem =
        campo.value.trim();

    if (!mensagem) {

        alert(
            "Digite uma mensagem."
        );

        return;
    }

    await enviarComandoEspecial(
        deviceId,
        "MESSAGE",
        mensagem
    );

    campo.value = "";

}


// ========================================
// ENVIAR NOTIFICAÇÃO
// ========================================

async function enviarNotificacao(
    deviceId
) {

    const mensagem =
        prompt(
            "Digite a mensagem da notificação:"
        );

    if (
        mensagem === null ||
        !mensagem.trim()
    ) {
        return;
    }

    await enviarComandoEspecial(
        deviceId,
        "NOTIFICATION",
        mensagem.trim()
    );

}


// ========================================
// COMANDO ESPECIAL
// ========================================

async function enviarComandoEspecial(
    deviceId,
    command,
    mensagem
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

                    body: JSON.stringify({
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
                "Erro ao enviar comando."
            );

        }

    } catch (erro) {

        alert(
            "Erro de comunicação."
        );

    }

}


// ========================================
// REVOGAR
// ========================================

async function revogar(
    deviceId
) {

    const confirmar =
        confirm(
            "Revogar este dispositivo?"
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

        await carregarDispositivos();

    } catch (erro) {

        alert(
            "Erro de comunicação."
        );

    }

}


// ========================================
// HISTÓRICO
// ========================================

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

            container.innerHTML = \`
                <div class="empty">
                    Nenhum comando registrado.
                </div>
            \`;

            return;
        }

        container.innerHTML =
            lista.slice(0, 50)
                .map(item => \`

                    <div class="history-item">

                        <div class="history-command">

                            \${escapeHtml(
                                item.command
                            )}

                        </div>

                        <div class="history-details">

                            Dispositivo:
                            \${escapeHtml(
                                item.deviceId
                            )}

                            <br>

                            \${escapeHtml(
                                item.detalhes || ""
                            )}

                            <br>

                            \${formatarData(
                                item.criadoEm
                            )}

                        </div>

                    </div>

                \`)
                .join("");

    } catch (erro) {

        console.error(
            "Erro ao carregar histórico:",
            erro
        );

    }

}


// ========================================
// FORMATAR DATA
// ========================================

function formatarData(data) {

    if (!data) {
        return "-";
    }

    try {

        return new Date(data)
            .toLocaleString("pt-BR");

    } catch {

        return data;

    }

}


// ========================================
// FORMATAR BYTES
// ========================================

function formatarBytes(bytes) {

    if (
        bytes === null ||
        bytes === undefined
    ) {
        return "-";
    }

    if (bytes < 1024) {
        return bytes + " B";
    }

    if (bytes < 1024 * 1024) {
        return (
            (bytes / 1024).toFixed(1) +
            " KB"
        );
    }

    if (bytes < 1024 * 1024 * 1024) {
        return (
            (bytes / (1024 * 1024)).toFixed(1) +
            " MB"
        );
    }

    return (
        (bytes /
            (1024 * 1024 * 1024)
        ).toFixed(1) +
        " GB"
    );

}


// ========================================
// SEGURANÇA HTML
// ========================================

function escapeHtml(valor) {

    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// ========================================
// ID SEGURO PARA HTML
// ========================================

function safeId(valor) {

    return String(valor)
        .replace(/[^a-zA-Z0-9_-]/g, "_");

}


// ========================================
// SEGURANÇA PARA JAVASCRIPT
// ========================================

function jsSafe(valor) {

    return String(valor)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");

}


// ========================================
// INICIALIZAÇÃO DO PAINEL
// ========================================

carregarDispositivos();

carregarHistorico();


// Atualiza dispositivos a cada 5 segundos
setInterval(
    carregarDispositivos,
    5000
);


// Atualiza histórico a cada 5 segundos
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
        dispositivos:
            dispositivos.size,
        hora:
            new Date().toISOString()
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