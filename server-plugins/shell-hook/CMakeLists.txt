cmake_minimum_required(VERSION 3.20)
project(shell_bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_executable(shell_bridge
  src/main.cpp
)

find_package(Threads REQUIRED)

target_link_libraries(shell_bridge PRIVATE Threads::Threads)

target_compile_definitions(shell_bridge PRIVATE BOOST_ERROR_CODE_HEADER_ONLY)
