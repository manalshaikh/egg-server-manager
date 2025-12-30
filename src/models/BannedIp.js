const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('BannedIp', {
        ip: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        reason: {
            type: DataTypes.STRING,
            defaultValue: 'Excessive login attempts'
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true // null means permanent
        }
    });
};
