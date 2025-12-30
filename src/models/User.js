const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('User', {
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        role: {
            type: DataTypes.STRING,
            defaultValue: 'user' // 'admin' or 'user'
        },
        ptero_url: {
            type: DataTypes.STRING,
            allowNull: true
        },
        ptero_api_key: {
            type: DataTypes.STRING,
            allowNull: true
        }
    });
};
