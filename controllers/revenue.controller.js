import {
    getRevenueChartData,
    getRevenueOverview,
    getRevenueStatistics,
} from "../services/revenue.service.js";

const getAdminRevenueOverview = async (req, res) => {
    try {
        const data = await getRevenueOverview(req.query || {});

        return res.status(200).json({
            success: true,
            message: "Admin revenue overview fetched successfully",
            data,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch admin revenue overview",
            error: error.message,
        });
    }
};

const getAdminRevenueChart = async (req, res) => {
    try {
        const data = await getRevenueChartData(req.query || {});

        return res.status(200).json({
            success: true,
            message: "Admin revenue chart fetched successfully",
            data,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch admin revenue chart",
            error: error.message,
        });
    }
};

const getAdminRevenueStatistics = async (req, res) => {
    try {
        const data = await getRevenueStatistics(req.query || {});

        return res.status(200).json({
            success: true,
            message: "Admin revenue statistics fetched successfully",
            data,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch admin revenue statistics",
            error: error.message,
        });
    }
};

export {
    getAdminRevenueChart,
    getAdminRevenueOverview,
    getAdminRevenueStatistics,
};
