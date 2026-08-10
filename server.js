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
            "User-Agent": "MasterControl/1.0"
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
// HISTÓRICO
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

        const anterior = dispositivos.get(deviceId);

        const dispositivo = {
            deviceId,

            marca:
                dados.marca ||
                anterior?.marca ||
                "",

            fabricante:
                dados.fabricante ||
                anterior?.fabricante ||
                "",

            modelo:
                dados.modelo ||
                anterior?.modelo ||
                "",

            android:
                dados.android ||
                anterior?.android ||
                "",

            ip,

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
        console.log("Carregando:  ", dispositivo.carregando);
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
                        atual.endereco ||
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

    const dispositivo =
        dispositivos.get(deviceId);

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
        comandosPendentes.set(
            deviceId,
            []
        );
    }

    const comando = {
        command,
        mensagem: mensagem || "",
        criadoEm: new Date().toISOString()
    };

    comandosPendentes
        .get(deviceId)
        .push(comando);

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
        console.log(
            "Mensagem:   ",
            mensagem
        );
    }

    console.log("========================================");
    console.log("");

    res.json({
        sucesso: true,
        mensagem: "Comando colocado na fila"
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

        const dispositivo =
            dispositivos.get(deviceId);

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
            return res.json({
                sucesso: true,
                comando: null
            });
        }

        const comando = fila.shift();

        res.json({
            sucesso: true,
            comando
        });
    }
);

// ========================================
// RECEBER RESPOSTA
// ========================================

app.post("/api/response", (req, res) => {
    const {
        deviceId,
        response
    } = req.body || {};

    if (
        !deviceId ||
        response === undefined
    ) {
        return res.status(400).json({
            sucesso: false,
            erro:
                "deviceId e response são obrigatórios"
        });
    }

    respostasDispositivos.set(
        deviceId,
        {
            response,
            recebidoEm:
                new Date().toISOString()
        }
    );

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
    console.log(
        "Dispositivo:",
        deviceId
    );
    console.log(
        "Resposta:   ",
        response
    );
    console.log("========================================");
    console.log("");

    res.json({
        sucesso: true
    });
});

// ========================================
// LISTAR DISPOSITIVOS
// ========================================

app.get("/api/devices", (req, res) => {
    const agora = Date.now();

    const lista =
        Array.from(
            dispositivos.values()
        ).map(dispositivo => {

            const ultimoContato =
                new Date(
                    dispositivo.ultimoContato
                ).getTime();

            const segundos =
                (agora - ultimoContato) /
                1000;

            return {
                ...dispositivo,

                status:
                    segundos <= 30 &&
                    !dispositivo.revogado
                        ? "ONLINE"
                        : "OFFLINE"
            };
        });

    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

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
            resposta:
                resposta || null
        });
    }
);

// ========================================
// HISTÓRICO
// ========================================

app.get("/api/history", (req, res) => {
    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.json({
        sucesso: true,
        historico:
            historicoComandos
    });
});

// ========================================
// REVOGAR
// ========================================

app.post(
    "/api/device/revoke",
    (req, res) => {

        const { deviceId } =
            req.body || {};

        if (!deviceId) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    "deviceId é obrigatório"
            });
        }

        const dispositivo =
            dispositivos.get(deviceId);

        if (!dispositivo) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    "Dispositivo não encontrado"
            });
        }

        dispositivo.revogado = true;

        dispositivos.set(
            deviceId,
            dispositivo
        );

        comandosPendentes.delete(
            deviceId
        );

        registrarComando(
            deviceId,
            "REVOKE",
            "Dispositivo revogado"
        );

        res.json({
            sucesso: true,
            mensagem:
                "Dispositivo revogado"
        });
    }
);

// ========================================
// REATIVAR
// ========================================

app.post(
    "/api/device/unrevoke",
    (req, res) => {

        const { deviceId } =
            req.body || {};

        if (!deviceId) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    "deviceId é obrigatório"
            });
        }

        const dispositivo =
            dispositivos.get(deviceId);

        if (!dispositivo) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    "Dispositivo não encontrado"
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
            mensagem:
                "Dispositivo reativado"
        });
    }
);

// ========================================
// PAINEL MASTER CONTROL
// ========================================

app.get("/", (req, res) => {

    res.send(`<!DOCTYPE html>
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
    background: #0d1117;
    color: #ffffff;
    font-family: Arial, sans-serif;
}

h1 {
    margin-bottom: 5px;
}

.subtitle {
    color: #8b949e;
    margin-bottom: 30px;
}

.cards {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));

    gap: 15px;

    margin-bottom: 30px;
}

.card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 20px;
}

.card-title {
    color: #8b949e;
    font-size: 13px;
}

.card-value {
    font-size: 34px;
    font-weight: bold;
    margin-top: 8px;
}

.device {
    background: #161b22;
    border: 1px solid #30363d;
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
    font-size: 20px;
    font-weight: bold;
}

.online {
    color: #3fb950;
    font-weight: bold;
}

.offline {
    color: #f85149;
    font-weight: bold;
}

.info {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(220px, 1fr));

    gap: 10px;

    margin-top: 18px;
}

.info-item {
    background: #0d1117;
    padding: 12px;
    border-radius: 8px;
}

.label {
    color: #8b949e;
    font-size: 12px;
}

.value {
    margin-top: 5px;
    font-size: 15px;
    word-break: break-word;
}

.history {
    margin-top: 35px;
}

.history-item {
    background: #161b22;
    border: 1px solid #30363d;
    padding: 14px;
    border-radius: 8px;
    margin-bottom: 8px;
}

.empty {
    color: #8b949e;
    padding: 20px;
}

.updated {
    color: #8b949e;
    font-size: 12px;
    margin-top: 15px;
}

.refresh {
    color: #8b949e;
    font-size: 12px;
    margin-bottom: 20px;
}

</style>

</head>

<body>

<h1>MASTER CONTROL</h1>

<div class="subtitle">
Painel de administração de dispositivos
</div>

<div class="refresh">
Atualização automática a cada 2 segundos
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

    <h2>Histórico</h2>

    <div id="historyList">

        <div class="empty">
            Nenhum comando registrado.
        </div>

    </div>

</div>

<script>

function formatarData(data) {

    if (!data) {
        return "Não informado";
    }

    const d = new Date(data);

    if (isNaN(d.getTime())) {
        return "Não informado";
    }

    return d.toLocaleString(
        "pt-BR"
    );
}

function formatarBateria(dispositivo) {

    if (
        dispositivo.bateria === null ||
        dispositivo.bateria === undefined
    ) {
        return "Não informado";
    }

    let texto =
        dispositivo.bateria + "%";

    if (dispositivo.carregando === true) {
        texto += " ⚡ Carregando";
    } else if (
        dispositivo.carregando === false
    ) {
        texto += " • Não carregando";
    }

    return texto;
}

function valor(valor) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {
        return "Não informado";
    }

    return valor;
}

async function atualizarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?t=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            dados.dispositivos || [];

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

        const container =
            document.getElementById(
                "devices"
            );

        if (lista.length === 0) {

            container.innerHTML = \`
                <div class="empty">
                    Nenhum dispositivo conectado.
                </div>
            \`;

            return;
        }

        container.innerHTML =
            lista.map(dispositivo => {

                const statusClass =
                    dispositivo.status === "ONLINE"
                        ? "online"
                        : "offline";

                return \`
                    <div class="device">

                        <div class="device-header">

                            <div class="device-name">
                                \${valor(
                                    dispositivo.modelo
                                )}
                            </div>

                            <div class="\${statusClass}">
                                ●
                                \${dispositivo.status}
                            </div>

                        </div>

                        <div class="info">

                            <div class="info-item">
                                <div class="label">
                                    DEVICE ID
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.deviceId
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    FABRICANTE
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.fabricante
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    MARCA
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.marca
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    ANDROID
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.android
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    IP
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.ip
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    BATERIA
                                </div>

                                <div class="value">
                                    \${formatarBateria(
                                        dispositivo
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    LATITUDE
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.latitude
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    LONGITUDE
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.longitude
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    BAIRRO
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.bairro
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    CIDADE
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.cidade
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    ESTADO
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.estado
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    CEP
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.cep
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    PAÍS
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.pais
                                    )}
                                </div>
                            </div>

                            <div class="info-item">
                                <div class="label">
                                    ENDEREÇO
                                </div>

                                <div class="value">
                                    \${valor(
                                        dispositivo.endereco
                                    )}
                                </div>
                            </div>

                        </div>

                        <div class="updated">

                            Último contato:
                            \${formatarData(
                                dispositivo.ultimoContato
                            )}

                        </div>

                    </div>
                \`;

            }).join("");

    } catch (erro) {

        console.error(
            "Erro ao atualizar dispositivos:",
            erro
        );
    }
}

async function atualizarHistorico() {

    try {

        const resposta =
            await fetch(
                "/api/history?t=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

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
            lista
                .slice(0, 30)
                .map(item => \`

                    <div class="history-item">

                        <strong>
                            \${valor(
                                item.command
                            )}
                        </strong>

                        <br>

                        Dispositivo:
                        \${valor(
                            item.deviceId
                        )}

                        <br>

                        \${item.detalhes
                            ? "Detalhes: " +
                              item.detalhes +
                              "<br>"
                            : ""}

                        <span class="label">
                            \${formatarData(
                                item.criadoEm
                            )}
                        </span>

                    </div>

                \`)
                .join("");

    } catch (erro) {

        console.error(
            "Erro ao atualizar histórico:",
            erro
        );
    }
}

// ========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ========================================

async function atualizarPainel() {

    await Promise.all([
        atualizarDispositivos(),
        atualizarHistorico()
    ]);
}

atualizarPainel();

setInterval(
    atualizarPainel,
    2000
);

</script>

</body>

</html>`);
});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", (req, res) => {

    res.set(
        "Cache-Control",
        "no-store"
    );

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
            "Atualização do painel: 2 segundos"
        );

        console.log(
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);