const AWS = require('aws-sdk');
const uuid = require('uuid');

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const TABLES_TABLE = process.env.TABLES_TABLE;
const RESERVATIONS_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
    const { resource, httpMethod, body, pathParameters, headers } = event;
    
    try {
        switch (`${resource} ${httpMethod}`) {
            case '/signup POST':
                return await signup(JSON.parse(body));
            case '/signin POST':
                return await signin(JSON.parse(body));
            case '/tables GET':
                return await getTables(headers);
            case '/tables POST':
                return await createTable(JSON.parse(body), headers);
            case '/tables/{tableId} GET':
                return await getTable(pathParameters.tableId, headers);
            case '/reservations POST':
                return await createReservation(JSON.parse(body), headers);
            case '/reservations GET':
                return await getReservations(headers);
            default:
                return { statusCode: 404, body: JSON.stringify({ message: 'Not Found' }) };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};

async function signup(body) {
    const { firstName, lastName, email, password } = body;
    
    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'given_name', Value: firstName },
            { Name: 'family_name', Value: lastName }
        ],
        MessageAction: 'SUPPRESS'
    };
    
    await cognito.adminCreateUser(params).promise();
    
    await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true
    }).promise();
    
    return { statusCode: 200, body: JSON.stringify({ message: 'User created successfully' }) };
}

async function signin(body) {
    const { email, password } = body;
    
    const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };
    
    const result = await cognito.initiateAuth(params).promise();
    return { 
        statusCode: 200, 
        body: JSON.stringify({ idToken: result.AuthenticationResult.IdToken }) 
    };
}

async function getTables(headers) {
    verifyToken(headers);
    
    const result = await dynamodb.scan({ TableName: TABLES_TABLE }).promise();
    return { statusCode: 200, body: JSON.stringify({ tables: result.Items }) };
}

async function createTable(body, headers) {
    verifyToken(headers);
    
    const params = {
        TableName: TABLES_TABLE,
        Item: body
    };
    
    await dynamodb.put(params).promise();
    return { statusCode: 200, body: JSON.stringify({ id: body.id }) };
}

async function getTable(tableId, headers) {
    verifyToken(headers);
    
    const params = {
        TableName: TABLES_TABLE,
        Key: { id: parseInt(tableId) }
    };
    
    const result = await dynamodb.get(params).promise();
    return { statusCode: 200, body: JSON.stringify(result.Item) };
}

async function createReservation(body, headers) {
    verifyToken(headers);
    
    const reservationId = uuid.v4();
    const params = {
        TableName: RESERVATIONS_TABLE,
        Item: { ...body, reservationId }
    };
    
    await dynamodb.put(params).promise();
    return { statusCode: 200, body: JSON.stringify({ reservationId }) };
}

async function getReservations(headers) {
    verifyToken(headers);
    
    const result = await dynamodb.scan({ TableName: RESERVATIONS_TABLE }).promise();
    return { statusCode: 200, body: JSON.stringify({ reservations: result.Items }) };
}

function verifyToken(headers) {
    const token = headers.Authorization;
    if (!token) {
        throw new Error('No token provided');
    }
    // In a real application, you would verify the token here
}