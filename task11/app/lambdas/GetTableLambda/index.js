// app/lambdas/GetTableLambda/index.js

const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const tableId = event.pathParameters.tableId;

  const params = {
    TableName: process.env.TABLES_TABLE_NAME,
    Key: {
      id: parseInt(tableId)
    }
  };

  try {
    const result = await dynamoDB.get(params).promise();
    if (result.Item) {
      return {
        statusCode: 200,
        body: JSON.stringify(result.Item)
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Table not found" })
      };
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};