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
// RECEBER DISPOSITIVO
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

        // Usa o ID enviado pelo Android.
        // Caso não exista, cria um ID baseado no IP.

        const deviceId =
            dados.deviceId ||
            dados.id ||
            `dispositivo-${ip}`;

        const dispositivo = {
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

            endereco:
                dados.endereco || "",

            ultimoContato:
                new Date().toISOString()
        };

        dispositivos.set(
            deviceId,
            dispositivo
        );

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
        console.log("Latitude:    ", dispositivo.latitude);
        console.log("Longitude:   ", dispositivo.longitude);
        console.log("========================================");
        console.log("");


        // ========================================
        // CONSULTAR ENDEREÇO
        // ========================================

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


    // Apenas comandos de diagnóstico.

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
// RECEBER RESPOSTA
// ========================================

app.post(
    "/api/response",
    (req, res) => {

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
        console.log("Dispositivo:", deviceId);
        console.log("Resposta:   ", response);
        console.log("========================================");
        console.log("");


        res.status(200).json({

            sucesso: true
        });
    }
);


// ========================================
// LISTAR TODOS OS DISPOSITIVOS
// ========================================

app.get(
    "/api/devices",
    (req, res) => {

        const agora =
            new Date();


        const lista =
            Array.from(
                dispositivos.values()
            ).map(dispositivo => {

                const ultimoContato =
                    new Date(
                        dispositivo.ultimoContato
                    );


                const segundos =
                    (
                        agora -
                        ultimoContato
                    ) / 1000;


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
    }
);


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
// PAINEL WEB
// ========================================

app.get("/", (req, res) => {

    res.send(`

<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Painel de Dispositivos</title>

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

    max-width: 1100px;

    margin: auto;

    padding: 30px;
}

h1 {

    text-align: center;

    margin-bottom: 30px;
}

.layout {

    display: grid;

    grid-template-columns:
        280px 1fr;

    gap: 20px;
}

.card {

    background: #1c1c1c;

    border-radius: 14px;

    padding: 20px;

    margin-bottom: 20px;
}

.lista {

    max-height: 600px;

    overflow-y: auto;
}

.dispositivo {

    background: #292929;

    padding: 14px;

    border-radius: 9px;

    margin-bottom: 10px;

    cursor: pointer;
}

.dispositivo:hover {

    background: #353535;
}

.dispositivo.selecionado {

    outline: 2px solid #777;
}

.nome {

    font-weight: bold;

    margin-bottom: 6px;

    word-break: break-word;
}

.online {

    color: #70d070;
}

.offline {

    color: #d07070;
}

.info {

    display: grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(200px, 1fr)
        );

    gap: 12px;
}

.item {

    background: #292929;

    padding: 12px;

    border-radius: 8px;
}

.label {

    color: #999;

    font-size: 13px;
}

.value {

    margin-top: 5px;

    word-break: break-word;
}

button {

    padding: 13px 24px;

    margin: 5px;

    border: none;

    border-radius: 8px;

    background: #333;

    color: white;

    cursor: pointer;

    font-size: 16px;
}

button:hover {

    background: #444;
}

pre {

    background: #080808;

    padding: 15px;

    border-radius: 8px;

    min-height: 50px;

    white-space: pre-wrap;

    word-break: break-word;
}

@media (max-width: 750px) {

    .layout {

        grid-template-columns: 1fr;
    }
}

</style>

</head>


<body>


<div class="container">

<h1>
Painel de Dispositivos
</h1>


<div class="layout">


<!-- ================================= -->
<!-- LISTA -->
<!-- ================================= -->

<div class="card">

<h2>
Dispositivos
</h2>

<div
    id="lista"
    class="lista">

Nenhum dispositivo.

</div>

</div>


<!-- ================================= -->
<!-- DETALHES -->
<!-- ================================= -->

<div>


<div class="card">

<h2 id="titulo">
Selecione um dispositivo
</h2>


<div
    id="status"
    class="value">

-

</div>


<div
    id="informacoes"
    class="info">

</div>

</div>


<div class="card">

<h2>
Comandos
</h2>


<button
    onclick="enviarComando('PING')">

PING

</button>


<button
    onclick="enviarComando('STATUS')">

STATUS

</button>

</div>


<div class="card">

<h2>
Última resposta
</h2>


<pre id="resposta">
Nenhuma resposta.
</pre>


<div
    id="horaResposta">

-

</div>

</div>


</div>


</div>

</div>


<script>

let dispositivos = [];

let dispositivoSelecionado = null;


// ========================================
// CARREGAR DISPOSITIVOS
// ========================================

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices"
            );


        const dados =
            await resposta.json();


        if (!dados.sucesso) {
            return;
        }


        dispositivos =
            dados.dispositivos || [];


        renderizarLista();


        if (dispositivoSelecionado) {

            const atualizado =
                dispositivos.find(
                    d =>
                        d.deviceId ===
                        dispositivoSelecionado.deviceId
                );


            if (atualizado) {

                dispositivoSelecionado =
                    atualizado;

                mostrarDispositivo(
                    atualizado
                );
            }
        }

    } catch (erro) {

        console.error(erro);
    }
}


// ========================================
// RENDERIZAR LISTA
// ========================================

function renderizarLista() {

    const lista =
        document.getElementById(
            "lista"
        );


    if (dispositivos.length === 0) {

        lista.innerHTML =
            "Nenhum dispositivo conectado.";

        return;
    }


    lista.innerHTML = "";


    dispositivos.forEach(
        dispositivo => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "dispositivo";


            if (
                dispositivoSelecionado &&
                dispositivoSelecionado.deviceId ===
                dispositivo.deviceId
            ) {

                div.classList.add(
                    "selecionado"
                );
            }


            const classeStatus =
                dispositivo.status ===
                "ONLINE"
                    ? "online"
                    : "offline";


            div.innerHTML = `

                <div class="nome">

                    ${escaparHtml(
                        dispositivo.deviceId
                    )}

                </div>

                <div class="${classeStatus}">

                    ${dispositivo.status}

                </div>

                <div>

                    ${escaparHtml(
                        dispositivo.modelo || "Modelo desconhecido"
                    )}

                </div>

            `;


            div.onclick =
                () => {

                    selecionarDispositivo(
                        dispositivo.deviceId
                    );
                };


            lista.appendChild(div);
        }
    );
}


// ========================================
// SELECIONAR DISPOSITIVO
// ========================================

function selecionarDispositivo(
    deviceId
) {

    const dispositivo =
        dispositivos.find(
            d =>
                d.deviceId ===
                deviceId
        );


    if (!dispositivo) {
        return;
    }


    dispositivoSelecionado =
        dispositivo;


    renderizarLista();

    mostrarDispositivo(
        dispositivo
    );


    atualizarResposta();
}


// ========================================
// MOSTRAR DADOS
// ========================================

function mostrarDispositivo(
    dispositivo
) {

    document.getElementById(
        "titulo"
    ).textContent =
        dispositivo.deviceId;


    const status =
        document.getElementById(
            "status"
        );


    status.textContent =
        "Status: " +
        dispositivo.status;


    status.className =
        dispositivo.status ===
        "ONLINE"
            ? "value online"
            : "value offline";


    const campos = [

        ["Marca", dispositivo.marca],

        ["Fabricante", dispositivo.fabricante],

        ["Modelo", dispositivo.modelo],

        ["Android", dispositivo.android],

        ["IP", dispositivo.ip],

        ["Cidade", dispositivo.cidade],

        ["Estado", dispositivo.estado],

        ["CEP", dispositivo.cep],

        ["País", dispositivo.pais],

        ["Latitude", dispositivo.latitude],

        ["Longitude", dispositivo.longitude],

        ["Bairro", dispositivo.bairro],

        ["Endereço", dispositivo.endereco],

        [
            "Último contato",
            dispositivo.ultimoContato
                ? new Date(
                    dispositivo.ultimoContato
                  ).toLocaleString("pt-BR")
                : "-"
        ]

    ];


    const informacoes =
        document.getElementById(
            "informacoes"
        );


    informacoes.innerHTML = "";


    campos.forEach(
        campo => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "item";


            item.innerHTML = `

                <div class="label">
                    ${campo[0]}
                </div>

                <div class="value">
                    ${escaparHtml(
                        String(
                            campo[1] ??
                            "-"
                        )
                    )}
                </div>

            `;


            informacoes.appendChild(
                item
            );
        }
    );
}


// ========================================
// ENVIAR COMANDO
// ========================================

async function enviarComando(
    command
) {

    if (!dispositivoSelecionado) {

        alert(
            "Selecione um dispositivo primeiro."
        );

        return;
    }


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

                            deviceId:
                                dispositivoSelecionado.deviceId,

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


        setTimeout(
            atualizarResposta,
            2000
        );

    } catch (erro) {

        document.getElementById(
            "resposta"
        ).textContent =
            "Erro de comunicação.";
    }
}


// ========================================
// ATUALIZAR RESPOSTA
// ========================================

async function atualizarResposta() {

    if (!dispositivoSelecionado) {
        return;
    }


    try {

        const resposta =
            await fetch(
                "/api/response/" +
                encodeURIComponent(
                    dispositivoSelecionado.deviceId
                )
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

            document.getElementById(
                "horaResposta"
            ).textContent =
                "Recebido em: " +
                new Date(
                    dados.resposta.recebidoEm
                ).toLocaleString(
                    "pt-BR"
                );
        }

    } catch (erro) {

        console.error(erro);
    }
}


// ========================================
// ESCAPAR HTML
// ========================================

function escaparHtml(texto) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        texto;

    return div.innerHTML;
}


// ========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ========================================

carregarDispositivos();

setInterval(
    carregarDispositivos,
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