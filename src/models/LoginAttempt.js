const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('LoginAttempt', {
        ip: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        attempts: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        lastAttempt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    });
};
