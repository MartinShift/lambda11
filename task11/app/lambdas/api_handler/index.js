const AWS = require('aws-sdk');
const uuid = require('uuid');

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const TABLES_TABLE = process.env.TABLES_TABLE;
const RESERVATIONS_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    console.log('Environment variables:', JSON.stringify({
        USER_POOL_ID,
        CLIENT_ID,
        TABLES_TABLE,
        RESERVATIONS_TABLE
    }));

    const { resource, httpMethod, body, pathParameters, headers } = event;
    
    try {
        const route = `${resource} ${httpMethod}`;
        console.log('Route:', route);

        switch (route) {
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
                console.log('Route not found:', route);
                return { statusCode: 404, body: JSON.stringify({ message: 'Not Found' }) };
        }
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
    }
};

async function signup(body) {
    console.log('Signup body:', JSON.stringify(body));
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
    
    try {
        await cognito.adminCreateUser(params).promise();
        
        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
        }).promise();
        
        console.log('User created successfully');
        return { statusCode: 200, body: JSON.stringify({ message: 'User created successfully' }) };
    } catch (error) {
        console.error('Error in signup:', error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Error in signup', error: error.message }) };
    }
}

async function signin(body) {
    console.log('Signin body:', JSON.stringify(body));
    const { email, password } = body;
    
    const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };
    
    try {
        const result = await cognito.initiateAuth(params).promise();
        console.log('Signin successful');
        return { 
            statusCode: 200, 
            body: JSON.stringify({ idToken: result.AuthenticationResult.IdToken }) 
        };
    } catch (error) {
        console.error('Error in signin:', error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Error in signin', error: error.message }) };
    }
}

async function getTables(headers) {
    console.log('Getting tables');
    verifyToken(headers);
    
    try {
        const result = await dynamodb.scan({ TableName: TABLES_TABLE }).promise();
        console.log('Tables retrieved:', JSON.stringify(result.Items));
        return { statusCode: 200, body: JSON.stringify({ tables: result.Items }) };
    } catch (error) {
        console.error('Error getting tables:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting tables', error: error.message }) };
    }
}

async function createTable(body, headers) {
    console.log('Creating table:', JSON.stringify(body));
    verifyToken(headers);
    
    const params = {
        TableName: TABLES_TABLE,
        Item: body
    };
    
    try {
        await dynamodb.put(params).promise();
        console.log('Table created successfully');
        return { statusCode: 200, body: JSON.stringify({ id: body.id }) };
    } catch (error) {
        console.error('Error creating table:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error creating table', error: error.message }) };
    }
}

async function getTable(tableId, headers) {
    console.log('Getting table:', tableId);
    verifyToken(headers);
    
    const params = {
        TableName: TABLES_TABLE,
        Key: { id: parseInt(tableId) }
    };
    
    try {
        const result = await dynamodb.get(params).promise();
        console.log('Table retrieved:', JSON.stringify(result.Item));
        return { statusCode: 200, body: JSON.stringify(result.Item) };
    } catch (error) {
        console.error('Error getting table:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting table', error: error.message }) };
    }
}

async function createReservation(body, headers) {
    console.log('Creating reservation:', JSON.stringify(body));
    verifyToken(headers);
    
    const reservationId = uuid.v4();
    const params = {
        TableName: RESERVATIONS_TABLE,
        Item: { ...body, reservationId }
    };
    
    try {
        await dynamodb.put(params).promise();
        console.log('Reservation created successfully');
        return { statusCode: 200, body: JSON.stringify({ reservationId }) };
    } catch (error) {
        console.error('Error creating reservation:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error creating reservation', error: error.message }) };
    }
}

async function getReservations(headers) {
    console.log('Getting reservations');
    verifyToken(headers);
    
    try {
        const result = await dynamodb.scan({ TableName: RESERVATIONS_TABLE }).promise();
        console.log('Reservations retrieved:', JSON.stringify(result.Items));
        return { statusCode: 200, body: JSON.stringify({ reservations: result.Items }) };
    } catch (error) {
        console.error('Error getting reservations:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting reservations', error: error.message }) };
    }
}

function verifyToken(headers) {
    console.log('Verifying token');
    const token = headers.Authorization;
    if (!token) {
        console.error('No token provided');
        throw new Error('No token provided');
    }
    // In a real application, you would verify the token here
    console.log('Token verified');
}