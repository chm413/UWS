#include <boost/asio.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/json.hpp>

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include <sys/sysinfo.h>

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;

struct BridgeConfig {
  std::string token;
  std::string server_id;
  std::string server_name;
  std::string style;
  std::string core;
  std::string version;
  std::string report_mode;
  std::vector<std::string> capabilities;
  std::string control_handler;
  unsigned short port;
  std::string host;
};

static std::string env_or(const char* key, std::string_view fallback) {
  const char* value = std::getenv(key);
  if (!value) return std::string(fallback);
  return std::string(value);
}

static std::vector<std::string> parse_caps(const std::string& value) {
  std::vector<std::string> result;
  std::string token;
  std::istringstream stream(value);
  while (std::getline(stream, token, ',')) {
    if (!token.empty()) {
      // trim whitespace
      auto start = token.find_first_not_of(" \t\n\r");
      auto end = token.find_last_not_of(" \t\n\r");
      if (start != std::string::npos) {
        result.emplace_back(token.substr(start, end - start + 1));
      }
    }
  }
  return result;
}

static std::uint64_t now_ms() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::system_clock::now().time_since_epoch())
      .count();
}

struct UsageStats {
  double cpu{0.0};
  double memory{0.0};
  unsigned threads{0};
  std::uint64_t uptime{0};
};

static UsageStats collect_usage() {
  UsageStats stats;
  const double cores = std::thread::hardware_concurrency();
  double load = 0.0;
  double loads[3];
  if (getloadavg(loads, 3) == 3) {
    load = loads[0];
  }
  if (cores > 0) {
    stats.cpu = std::min(100.0, (load / cores) * 100.0);
  }

  struct sysinfo info;
  if (sysinfo(&info) == 0) {
    const double total = static_cast<double>(info.totalram);
    const double free = static_cast<double>(info.freeram);
    if (total > 0) {
      stats.memory = (total - free) / total * 100.0;
    }
    stats.uptime = static_cast<std::uint64_t>(info.uptime);
  }
  stats.threads = std::thread::hardware_concurrency();
  return stats;
}

static std::optional<std::string> invoke_control_handler(const std::string& action,
                                                         const boost::json::object& params,
                                                         const std::string& handler) {
  if (handler.empty()) {
    return std::nullopt;
  }

  ::setenv("UWS_ACTION", action.c_str(), 1);
  const std::string serialized = boost::json::serialize(params);
  ::setenv("UWS_PARAMS", serialized.c_str(), 1);

  std::unique_ptr<FILE, decltype(&pclose)> pipe(::popen(handler.c_str(), "r"), pclose);
  if (!pipe) {
    return std::string("failed to execute control handler");
  }

  std::string output;
  char buffer[256];
  while (fgets(buffer, sizeof(buffer), pipe.get())) {
    output.append(buffer);
  }
  return output;
}

class session : public std::enable_shared_from_this<session> {
 public:
  session(tcp::socket&& socket, const BridgeConfig& config)
      : ws_(std::move(socket)), config_(config) {}

  void run() {
    ws_.set_option(websocket::stream_base::timeout::suggested(beast::role_type::server));
    ws_.set_option(websocket::stream_base::decorator(
        [](websocket::response_type& res) { res.set(beast::http::field::server, "uws-shell-hook/1.0"); }));
    ws_.async_accept(
        beast::bind_front_handler(&session::on_accept, shared_from_this()));
  }

 private:
  websocket::stream<tcp::socket> ws_;
  beast::flat_buffer buffer_;
  BridgeConfig config_;
  bool authenticated_ = false;

  void on_accept(beast::error_code ec) {
    if (ec) {
      return;
    }
    do_read();
  }

  void do_read() {
    ws_.async_read(buffer_, beast::bind_front_handler(&session::on_read, shared_from_this()));
  }

  void on_read(beast::error_code ec, std::size_t) {
    boost::ignore_unused(ec);
    if (ec == websocket::error::closed) {
      return;
    }
    if (ec) {
      return;
    }

    const std::string message = beast::buffers_to_string(buffer_.data());
    buffer_.consume(buffer_.size());
    handle_message(message);
    do_read();
  }

  void send_object(boost::json::object response) {
    response["schema"] = "uwbp/v2";
    response["timestamp"] = now_ms();
    ws_.text(true);
    ws_.async_write(
        asio::buffer(boost::json::serialize(response)),
        [](beast::error_code, std::size_t) {});
  }

  void send_error(const std::string& cmd, const std::string& request_id, std::string message,
                  std::string status = "fail") {
    boost::json::object response{{"mode", "response"},
                                 {"cmd", cmd},
                                 {"status", status},
                                 {"requestId", request_id},
                                 {"msg", message}};
    send_object(std::move(response));
  }

  void handle_message(const std::string& text) {
    boost::json::error_code jec;
    auto value = boost::json::parse(text, jec);
    if (jec || !value.is_object()) {
      return;
    }

    auto& obj = value.as_object();
    const std::string cmd = obj.if_contains("cmd") ? boost::json::value_to<std::string>(*obj.if_contains("cmd")) : "";
    const std::string request_id = obj.if_contains("requestId")
                                       ? boost::json::value_to<std::string>(*obj.if_contains("requestId"))
                                       : "";

    if (!authenticated_) {
      if (cmd != "auth") {
        send_error(cmd, request_id, "authentication required", "unauthorized");
        return;
      }
      const auto* data = obj.if_contains("data");
      const std::string provided = (data && data->is_object() && data->as_object().if_contains("token"))
                                       ? boost::json::value_to<std::string>(*data->as_object().if_contains("token"))
                                       : "";
      if (provided != config_.token) {
        send_error("auth", request_id, "invalid token", "unauthorized");
        ws_.async_close(websocket::close_code::normal, [](beast::error_code) {});
        return;
      }
      authenticated_ = true;
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "auth"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"data",
                                    {{"serverId", config_.server_id},
                                     {"style", config_.style},
                                     {"core", config_.core},
                                     {"version", config_.version},
                                     {"reportMode", config_.report_mode}}}};
      send_object(std::move(response));
      return;
    }

    if (cmd == "ping") {
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "pong"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"data", {{"time", now_ms()}}}};
      send_object(std::move(response));
      return;
    }

    if (cmd == "getUsage") {
      const UsageStats stats = collect_usage();
      boost::json::object data{{"cpu", stats.cpu},
                               {"memory", stats.memory},
                               {"threads", stats.threads},
                               {"uptime", stats.uptime}};
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "getUsage"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"data", std::move(data)}};
      send_object(std::move(response));
      return;
    }

    if (cmd == "getServerInfo") {
      boost::json::object info{{"name", config_.server_name},
                               {"core", config_.core},
                               {"style", config_.style},
                               {"version", config_.version}};
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "getServerInfo"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"data", std::move(info)}};
      send_object(std::move(response));
      return;
    }

    if (cmd == "getCapabilities") {
      boost::json::array caps;
      for (const auto& capability : config_.capabilities) {
        caps.emplace_back(capability);
      }
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "getCapabilities"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"data", {{"caps", std::move(caps)}}}};
      send_object(std::move(response));
      return;
    }

    if (cmd == "control") {
      auto* data = obj.if_contains("data");
      if (!data || !data->is_object()) {
        send_error("control", request_id, "missing data");
        return;
      }
      auto& control = data->as_object();
      const auto* action_value = control.if_contains("action");
      if (!action_value || !action_value->is_string()) {
        send_error("control", request_id, "missing action");
        return;
      }
      const std::string action = boost::json::value_to<std::string>(*action_value);
      boost::json::object params;
      if (auto* params_value = control.if_contains("params")) {
        if (params_value->is_object()) {
          params = params_value->as_object();
        }
      }
      auto output = invoke_control_handler(action, params, config_.control_handler);
      if (!output) {
        send_error("control", request_id, "control handler unavailable", "unsupported");
        return;
      }
      boost::json::object response{{"mode", "response"},
                                   {"cmd", "control"},
                                   {"status", "success"},
                                   {"requestId", request_id},
                                   {"msg", *output}};
      send_object(std::move(response));
      return;
    }

    send_error(cmd, request_id, "unsupported command", "unsupported");
  }
};

class server {
 public:
  server(asio::io_context& ioc, const BridgeConfig& config)
      : acceptor_(ioc), config_(config) {
    tcp::endpoint endpoint(asio::ip::make_address(config.host), config.port);
    acceptor_.open(endpoint.protocol());
    acceptor_.set_option(asio::socket_base::reuse_address(true));
    acceptor_.bind(endpoint);
    acceptor_.listen(asio::socket_base::max_listen_connections);
    do_accept();
  }

 private:
  tcp::acceptor acceptor_;
  BridgeConfig config_;

  void do_accept() {
    acceptor_.async_accept([this](beast::error_code ec, tcp::socket socket) {
      if (!ec) {
        std::make_shared<session>(std::move(socket), config_)->run();
      }
      do_accept();
    });
  }
};

static void run_bridge(const BridgeConfig& config) {
  asio::io_context ioc;
  server srv(ioc, config);
  ioc.run();
}

int main() {
  BridgeConfig config{
      .token = env_or("BRIDGE_TOKEN", "change-me"),
      .server_id = env_or("SERVER_ID", "shell-hook"),
      .server_name = env_or("SERVER_NAME", "Shell Hook Bridge"),
      .style = env_or("SERVER_STYLE", "Shell"),
      .core = env_or("CORE_NAME", "Shell"),
      .version = env_or("VERSION", "1.0.0"),
      .report_mode = env_or("REPORT_MODE", "passive"),
      .capabilities = parse_caps(env_or("CAPABILITIES", "core.info,metrics.tps")),
      .control_handler = env_or("CONTROL_HANDLER", ""),
      .port = static_cast<unsigned short>(std::stoi(env_or("BRIDGE_PORT", "6250"))),
      .host = env_or("BRIDGE_HOST", "0.0.0.0"),
  };

  std::signal(SIGINT, [](int) {
    std::exit(0);
  });
  std::signal(SIGTERM, [](int) {
    std::exit(0);
  });

  try {
    run_bridge(config);
  } catch (const std::exception& ex) {
    std::cerr << "bridge failed: " << ex.what() << std::endl;
    return 1;
  }
  return 0;
}

#include <boost/json/src.hpp>
