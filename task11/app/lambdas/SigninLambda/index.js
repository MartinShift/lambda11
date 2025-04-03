// app/lambdas/SigninLambda/index.js

const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  const { email, password } = JSON.parse(event.body);

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  };

  try {
    const result = await cognito.initiateAuth(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ idToken: result.AuthenticationResult.IdToken })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};